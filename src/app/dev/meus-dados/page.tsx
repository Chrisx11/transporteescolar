import { notFound } from "next/navigation";
import { FormMeusDados } from "@/app/app/meus-dados/form-meus-dados";

/** Prévia da tela Meus dados do aluno, só no servidor local (404 em produção). */
export default function PreviaMeusDados() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-md bg-[#f4f6fb] p-4">
      <FormMeusDados nome="ALUNO TESTE DA SILVA" cpf="123.456.789-09" telefone="(22) 99999-0000" email="aluno@exemplo.com" foto={null} />
    </main>
  );
}
