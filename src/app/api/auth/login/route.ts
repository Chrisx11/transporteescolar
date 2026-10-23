import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cpfValido, limparCpf } from "@/lib/cpf";
import { AREAS_LOGIN, ehPerfil, inicioDoPerfil, type Perfil } from "@/lib/rotulos";

const JANELA_MIN = 15;
const MAX_FALHAS_CPF = 5;
const MAX_FALHAS_IP = 30;
const ERRO_GENERICO = "CPF ou senha incorretos.";

/**
 * Login por CPF: o servidor encontra o login (e-mail no Supabase Auth) ligado
 * ao CPF e autentica com a senha. A resposta de erro é sempre a mesma para não
 * revelar quais CPFs estão cadastrados.
 */
export async function POST(req: NextRequest) {
  let corpo: { cpf?: string; senha?: string; perfil?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const cpf = limparCpf(corpo.cpf ?? "");
  const senha = corpo.senha ?? "";
  const area = corpo.perfil && ehPerfil(corpo.perfil) ? corpo.perfil : null;
  if (!cpfValido(cpf) || !senha || !area) {
    return NextResponse.json({ erro: "Informe um CPF válido e a senha." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const admin = criarClienteAdmin();
  const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString();

  const [{ count: falhasCpf }, { count: falhasIp }] = await Promise.all([
    admin.from("tentativas_login").select("id", { count: "exact", head: true })
      .eq("cpf", cpf).eq("sucesso", false).gte("criado_em", desde),
    ip
      ? admin.from("tentativas_login").select("id", { count: "exact", head: true })
          .eq("ip", ip).eq("sucesso", false).gte("criado_em", desde)
      : Promise.resolve({ count: 0 }),
  ]);
  if ((falhasCpf ?? 0) >= MAX_FALHAS_CPF || (falhasIp ?? 0) >= MAX_FALHAS_IP) {
    return NextResponse.json(
      { erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` },
      { status: 429 },
    );
  }

  const registrar = (sucesso: boolean) =>
    admin.from("tentativas_login").insert({ cpf, ip, sucesso });

  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, perfil, ativo, troca_senha_obrigatoria")
    .eq("cpf", cpf)
    .maybeSingle();

  if (!usuario || !usuario.ativo) {
    await registrar(false);
    return NextResponse.json({ erro: ERRO_GENERICO }, { status: 401 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(usuario.id);
  const email = authUser.user?.email;
  if (!email) {
    await registrar(false);
    return NextResponse.json({ erro: ERRO_GENERICO }, { status: 401 });
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    await registrar(false);
    return NextResponse.json({ erro: ERRO_GENERICO }, { status: 401 });
  }
  await registrar(true);

  // Cada página de login aceita só o próprio perfil. Esta checagem vem depois da
  // senha conferida, para não revelar a quem pertence um CPF.
  if (usuario.perfil !== area) {
    await supabase.auth.signOut();
    const certa = AREAS_LOGIN[usuario.perfil as Perfil];
    return NextResponse.json(
      {
        erro: `Este CPF não tem acesso como ${AREAS_LOGIN[area].titulo}. Entre pela página "${certa.titulo}".`,
      },
      { status: 403 },
    );
  }

  const destino = usuario.troca_senha_obrigatoria
    ? "/trocar-senha"
    : inicioDoPerfil(usuario.perfil as Perfil);
  return NextResponse.json({ destino });
}
