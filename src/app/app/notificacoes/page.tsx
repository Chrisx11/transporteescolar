import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TelaNotificacoes } from "./tela-notificacoes";

export const metadata: Metadata = { title: "Notificações" };

/** Ativar, testar e escolher as notificações no celular (aluno e motorista). */
export default async function PaginaNotificacoes() {
  const sessao = await exigirPerfil("aluno", "motorista");
  let lembretes = true;
  if (sessao.perfil === "aluno") {
    const supabase = await criarClienteServidor();
    const { data } = await supabase.from("usuarios").select("receber_lembretes").eq("id", sessao.id).maybeSingle();
    lembretes = data?.receber_lembretes ?? true;
  }
  return <TelaNotificacoes app={sessao.perfil === "motorista" ? "motorista" : "aluno"} lembretes={lembretes} />;
}
