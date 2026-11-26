import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/dev": prévias de tela só do servidor local (as páginas dão 404 em produção).
const ROTAS_PUBLICAS = [
  "/login", "/aluno", "/motorista", "/semeduc", "/semtransp", "/admin",
  "/cadastro", "/completar", "/continuar", "/primeiro-acesso", "/esqueci-senha", "/auth", "/offline", "/api/auth/login", "/dev",
];

/** Login de cada área do site (quem não está logado volta para o login certo). */
function loginDa(caminho: string): string {
  if (caminho.startsWith("/app/motorista")) return "/motorista";
  if (caminho.startsWith("/app") || caminho.startsWith("/embarque")) return "/aluno";
  if (/^\/painel\/(alunos|instituicoes|calendario|pedidos-passe)/.test(caminho)) return "/semeduc";
  if (/^\/painel\/(usuarios|parametros)/.test(caminho)) return "/admin";
  if (caminho.startsWith("/painel")) return "/semtransp";
  return "/aluno";
}

export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  // Renova a sessão (não remover). getClaims confere a assinatura do token com a
  // chave pública do projeto (ES256) sem ir ao servidor do Supabase a cada página.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const caminho = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(r + "/"));

  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = loginDa(caminho);
    url.search = caminho === "/" ? "" : `?voltar=${encodeURIComponent(caminho)}`;
    return NextResponse.redirect(url);
  }

  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icones/).*)"],
};
