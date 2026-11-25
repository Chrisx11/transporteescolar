import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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
  /** Login de Admin (mesmo quando está vendo outra área). */
  admin: boolean;
};

/** Cookie com a área que o Admin está vendo (aluno, motorista, semeduc, semtransp); ausente = Admin completo. */
export const COOKIE_MODO_ADMIN = "modo_admin";
export const MODOS_ADMIN = ["aluno", "motorista", "semeduc", "semtransp"] as const;
export type ModoAdmin = (typeof MODOS_ADMIN)[number];
export const ehModoAdmin = (v: unknown): v is ModoAdmin => (MODOS_ADMIN as readonly unknown[]).includes(v);

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
  const sessao: UsuarioSessao = { ...(data as Omit<UsuarioSessao, "admin">), admin: data.perfil === "admin" };
  // O Admin pode testar cada área (aluno, motorista, SEMEDUC, SEMTRANSP) com o próprio login.
  if (sessao.admin) {
    const modo = (await cookies()).get(COOKIE_MODO_ADMIN)?.value;
    if (ehModoAdmin(modo)) sessao.perfil = modo;
  }
  return sessao;
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
