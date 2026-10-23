"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { obterSessao } from "@/lib/auth";
import { cpfValido, limparCpf } from "@/lib/cpf";
import { validarNovaSenha } from "@/lib/senha";
import { inicioDoPerfil } from "@/lib/rotulos";
import type { Estado } from "@/lib/acoes";

async function salvarNovaSenha(fd: FormData): Promise<string | null> {
  const senha = String(fd.get("senha") ?? "");
  const confirmacao = String(fd.get("confirmacao") ?? "");
  const problema = validarNovaSenha(senha);
  if (problema) return problema;
  if (senha !== confirmacao) return "As duas senhas não são iguais.";

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    if (error.code === "same_password") return "A nova senha precisa ser diferente da atual.";
    return "Não foi possível trocar a senha. Tente novamente.";
  }
  await supabase.rpc("marcar_senha_trocada");
  return null;
}

/** Troca obrigatória da senha provisória no primeiro acesso. */
export async function trocarSenha(_: Estado, fd: FormData): Promise<Estado> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  const erro = await salvarNovaSenha(fd);
  if (erro) return { erro };
  redirect(sessao.perfil === "aluno" ? "/termo" : inicioDoPerfil(sessao.perfil));
}

/** Nova senha depois de abrir o link de recuperação enviado por e-mail. */
export async function redefinirSenha(_: Estado, fd: FormData): Promise<Estado> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "O link expirou. Peça um novo." };
  const erro = await salvarNovaSenha(fd);
  if (erro) return { erro };
  await supabase.auth.signOut();
  redirect("/login?senha=redefinida");
}

/** Envia o link de recuperação para o e-mail cadastrado no CPF. */
export async function pedirRecuperacao(_: Estado, fd: FormData): Promise<Estado> {
  const cpf = limparCpf(String(fd.get("cpf") ?? ""));
  if (!cpfValido(cpf)) return { erro: "CPF inválido." };

  // Mesma resposta em todos os casos, para não revelar quais CPFs existem.
  const resposta: Estado = {
    ok:
      "Se este CPF tiver e-mail cadastrado, enviamos um link para criar uma nova senha. " +
      "Se você não tem e-mail cadastrado, procure a secretaria para receber uma senha provisória.",
  };

  const admin = criarClienteAdmin();
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, ativo")
    .eq("cpf", cpf)
    .maybeSingle();
  if (!usuario?.email || !usuario.ativo) return resposta;

  const h = await headers();
  const origem =
    process.env.NEXT_PUBLIC_APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await criarClienteServidor();
  await supabase.auth.resetPasswordForEmail(usuario.email, {
    redirectTo: `${origem}/auth/callback?proximo=/redefinir-senha`,
  });
  return resposta;
}

/** Aceite do termo de uso e privacidade (LGPD). */
export async function aceitarTermo(_: Estado, fd: FormData): Promise<Estado> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (fd.get("aceito") !== "on") return { erro: "Marque a caixa para aceitar o termo." };
  const supabase = await criarClienteServidor();
  const { data: p } = await supabase.from("parametros").select("valor").eq("chave", "termo_versao").single();
  const { error } = await supabase
    .from("aceites_termo")
    .upsert(
      { usuario_id: sessao.id, versao: String(p?.valor ?? "1.0") },
      { onConflict: "usuario_id,versao", ignoreDuplicates: true },
    );
  if (error) return { erro: "Não foi possível registrar o aceite. Tente novamente." };
  redirect(inicioDoPerfil(sessao.perfil));
}
