import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { inicioDoPerfil, type Perfil } from "@/lib/rotulos";

export type UsuarioSessao = {
  id: string;
  cpf: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  perfil: Perfil;
  ativo: boolean;
  troca_senha_obrigatoria: boolean;
  /** Login de Admin. */
  admin: boolean;
};

/** Usuário logado + registro em `usuarios`. Nulo se não houver sessão válida. */
export const obterSessao = cache(async (): Promise<UsuarioSessao | null> => {
  const supabase = await criarClienteServidor();
  // Confere o token localmente (chave pública ES256), sem ir ao Supabase Auth.
  const { data: auth } = await supabase.auth.getClaims();
  const id = auth?.claims?.sub;
  if (!id) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id, cpf, nome, email, telefone, perfil, ativo, troca_senha_obrigatoria")
    .eq("id", id)
    .maybeSingle();
  if (!data || !data.ativo) return null;
  return { ...(data as Omit<UsuarioSessao, "admin">), admin: data.perfil === "admin" };
});

/**
 * Exige login com um dos perfis. Também força a troca da senha provisória.
 * Cada perfil só entra na própria área (o Admin só cria usuários).
 */
export async function exigirPerfil(...perfis: Perfil[]): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.troca_senha_obrigatoria) redirect("/trocar-senha");
  const permitido = perfis.length === 0 || perfis.includes(sessao.perfil);
  if (!permitido) redirect(inicioDoPerfil(sessao.perfil));
  return sessao;
}

/** Para Server Actions: retorna a sessão ou lança erro (sem redirecionar). */
export async function sessaoComPerfil(...perfis: Perfil[]): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao || sessao.troca_senha_obrigatoria) throw new Error("Sessão expirada. Entre novamente.");
  if (!perfis.includes(sessao.perfil)) throw new Error("Você não tem permissão para esta ação.");
  return sessao;
}
