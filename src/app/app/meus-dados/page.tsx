import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { formatarCpf } from "@/lib/cpf";
import { FormMeusDados } from "./form-meus-dados";

export const metadata: Metadata = { title: "Meus dados" };

/** Dados do aluno: muda telefone, e-mail e foto; nome e CPF só a Secretaria de Educação. */
export default async function PaginaMeusDados() {
  const sessao = await exigirPerfil("aluno");
  if (sessao.admin) redirect("/app");
  const supabase = await criarClienteServidor();
  const { data: aluno } = await supabase.from("alunos").select("foto_path").eq("usuario_id", sessao.id).maybeSingle();
  const foto = aluno?.foto_path ? (await supabase.storage.from("fotos").createSignedUrl(aluno.foto_path, 3600)).data?.signedUrl : null;
  const emailReal = sessao.email && !sessao.email.endsWith("@login.italva.invalid") ? sessao.email : "";

  return (
    <FormMeusDados
      nome={sessao.nome}
      cpf={formatarCpf(sessao.cpf)}
      telefone={sessao.telefone ?? ""}
      email={emailReal}
      foto={foto ?? null}
    />
  );
}
