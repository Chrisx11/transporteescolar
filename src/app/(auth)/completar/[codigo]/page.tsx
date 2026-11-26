import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { pedidoDoCodigo } from "../pedido";
import { FormCompletar } from "./form-completar";

export const metadata: Metadata = { title: "Completar pedido de passe", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Link individual enviado por e-mail aos alunos importados das planilhas. */
export default async function PaginaCompletar({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const pedido = await pedidoDoCodigo(codigo);
  if (!pedido) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <LinkIcon className="size-8" />
        </span>
        <h1 className="text-xl font-bold text-slate-900">Este link não vale mais</h1>
        <p className="text-sm text-slate-600">
          Ele pode ter expirado ou já ter sido usado. Se você ainda não completou seu pedido, procure a Secretaria de Educação
          para receber um novo link.
        </p>
        <Link href="/aluno" className="text-sm font-semibold text-azul-700 hover:underline">
          Ir para a página do aluno
        </Link>
      </div>
    );
  }
  const instituicao = (pedido.instituicao as unknown as { nome: string } | null)?.nome ?? pedido.instituicao_outra ?? "";
  return (
    <FormCompletar
      codigo={codigo}
      pedido={{
        nome: pedido.nome,
        email: pedido.email ?? "",
        telefone: pedido.telefone,
        cidade: pedido.cidade === "campos" ? "Campos" : "Itaperuna",
        instituicao,
        curso: pedido.curso,
        endereco: pedido.endereco ?? "",
        bairro: pedido.bairro ?? "",
        data_nascimento: pedido.data_nascimento ?? "",
      }}
    />
  );
}
