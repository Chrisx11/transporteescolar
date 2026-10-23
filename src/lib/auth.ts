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
};

/** Usuário logado + registro em `usuarios`. Nulo se não houver sessão válida. */
export const obterSessao = cache(async (): Promise<UsuarioSessao | null> => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id, cpf, nome, email, telefone, perfil, ativo, troca_senha_obrigatoria")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.ativo) return null;
  return data as UsuarioSessao;
});

/**
 * Exige login com um dos perfis. Também força a troca da senha provisória.
 * O Admin tem acesso a todas as áreas do painel.
 */
export async function exigirPerfil(...perfis: Perfil[]): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.troca_senha_obrigatoria) redirect("/trocar-senha");
  const permitido =
    perfis.length === 0 ||
    perfis.includes(sessao.perfil) ||
    (sessao.perfil === "admin" && perfis.some((p) => p === "semeduc" || p === "semtransp"));
  if (!permitido) redirect(inicioDoPerfil(sessao.perfil));
  return sessao;
}

/** Para Server Actions: retorna a sessão ou lança erro (sem redirecionar). */
export async function sessaoComPerfil(...perfis: Perfil[]): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao || sessao.troca_senha_obrigatoria) throw new Error("Sessão expirada. Entre novamente.");
  const ok =
    perfis.includes(sessao.perfil) ||
    (sessao.perfil === "admin" && perfis.some((p) => p === "semeduc" || p === "semtransp"));
  if (!ok) throw new Error("Você não tem permissão para esta ação.");
  return sessao;
}
