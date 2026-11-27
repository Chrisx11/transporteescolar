import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormJustificativa } from "./form-justificativa";

export const metadata: Metadata = { title: "Justificar falta" };

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function PaginaJustificar({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("aluno");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("meu_historico", { p_dias: 400 });
  const falta = ((data ?? []) as { frequencia_id: number; nome: string; saida_em: string; pode_justificar: boolean }[]).find(
    (l) => l.frequencia_id === id,
  );
  if (!falta) notFound();
  return <FormJustificativa frequencia={id} viagem={`${falta.nome} · ${HORA.format(new Date(falta.saida_em))}`} podeJustificar={falta.pode_justificar} />;
}
