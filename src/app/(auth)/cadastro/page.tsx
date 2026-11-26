import type { Metadata } from "next";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { FormCadastro, type Instituicao } from "./form-cadastro";

export const metadata: Metadata = { title: "Cadastro no transporte" };
export const revalidate = 300; // lista de instituições atualizada a cada 5 minutos

/** Pré-cadastro para quem ainda não tem acesso ao transporte. */
export default async function PaginaCadastro() {
  const { data } = await criarClienteAdmin().from("instituicoes").select("id, nome, cidade").eq("ativa", true).order("nome");
  return <FormCadastro instituicoes={(data ?? []) as Instituicao[]} />;
}
