import type { Metadata } from "next";
import { ArrowLeft, UserPlus } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { BotaoLink, Cartao, Titulo } from "@/components/ui";
import { FormNovoAluno } from "./form-novo-aluno";

export const metadata: Metadata = { title: "Novo aluno" };

export default async function PaginaNovoAluno() {
  await exigirPerfil("semeduc");
  return (
    <>
      <Titulo icone={UserPlus}
        descricao="Depois de cadastrar, complete documentos, vínculos, pontos e grade na página do aluno."
        acoes={
          <BotaoLink variante="secundario" href="/painel/alunos">
            <ArrowLeft /> Alunos
          </BotaoLink>
        }
      >
        Novo aluno
      </Titulo>
      <Cartao className="max-w-2xl">
        <FormNovoAluno />
      </Cartao>
    </>
  );
}
