"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Botao } from "@/components/ui";
import { BotaoEnviar } from "@/components/formulario";
import { CamposDadosAluno } from "../campos-dados";
import { criarAluno } from "../acoes";

export function FormNovoAluno() {
  const [estado, despachar] = useActionState(criarAluno, null);

  if (estado?.ok && estado.dados?.id) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="ok">{estado.ok}</Aviso>
        <div className="flex gap-3">
          <Link
            href={`/painel/alunos/${estado.dados.id}`}
            className="rounded-lg bg-azul-700 px-4 py-2 text-sm font-semibold text-white hover:bg-azul-800"
          >
            Completar cadastro do aluno
          </Link>
          <Botao variante="secundario" onClick={() => window.location.reload()}>
            Cadastrar outro
          </Botao>
        </div>
      </div>
    );
  }

  return (
    <form action={despachar} className="flex flex-col gap-4">
      <CamposDadosAluno />
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <div>
        <BotaoEnviar>Cadastrar aluno</BotaoEnviar>
      </div>
    </form>
  );
}
