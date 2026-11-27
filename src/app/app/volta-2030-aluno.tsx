"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, Hourglass, Loader2, TicketCheck, XCircle } from "lucide-react";
import { Botao } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";
import { desistirVolta2030, reservarVolta2030 } from "./acoes";

export type MinhaVolta2030 = {
  status: "aberta" | "confirmada" | "cancelada";
  saida_em: string;
  vagas: number;
  reservados: number;
  minha: "aguardando" | "confirmada" | "cancelada" | "desistiu" | null;
  na_22: boolean;
  prefixo: string;
};

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Volta 20:30 de Itaperuna na tela Hoje do aluno (seção 9). Só aparece depois que um
 * motorista libera, e só para quem tem a volta das 22:00. Some quando confirma.
 */
export function Volta2030Aluno({ v }: { v: MinhaVolta2030 }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [janela, confirmar] = useConfirmacao();
  const hora = HORA.format(new Date(v.saida_em));
  const naLista = v.minha === "aguardando";

  // Enquanto espera completar, atualiza sozinho para mostrar a confirmação.
  useEffect(() => {
    if (v.status !== "aberta") return;
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [v.status, router]);

  // Confirmada: a viagem 20:30 aparece como um cartão normal (com ônibus e QR); some para os outros.
  if (v.status === "confirmada") return null;
  if (v.status === "cancelada") {
    if (v.minha !== "cancelada") return null;
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-suave">
        <XCircle className="mt-0.5 size-5 shrink-0 text-slate-400" />
        Não completou o mínimo: não haverá ônibus às {hora}. Você continua na volta das 22:00, sem falta.
      </div>
    );
  }
  if (!v.na_22) return null;

  function reservar() {
    iniciar(async () => {
      const r = await reservarVolta2030();
      if (!r.ok) toast.error(r.erro);
      else if (r.confirmada) toast.success(`Volta ${hora} confirmada! Vá para o ponto.`);
      else toast.success(`Você está na lista da ${hora}. Faltam ${r.faltam} aluno(s) para confirmar.`);
      router.refresh();
    });
  }

  async function desistir() {
    if (!(await confirmar(`Sair da lista da volta ${hora}? Você continua na volta das 22:00.`))) return;
    iniciar(async () => {
      const r = await desistirVolta2030();
      if (r.ok) toast.success("Você saiu da lista. Continua na volta das 22:00.");
      else toast.error(r.erro);
      router.refresh();
    });
  }

  const faltam = Math.max(0, v.vagas - v.reservados);
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-suave ring-2 ring-violet-200">
      {janela}
      <div className="flex items-center gap-4 p-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg">
          <ArrowDownLeft className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">Volta mais cedo</p>
          <p className="font-semibold text-slate-900">Volta {hora} liberada</p>
          <p className="text-sm text-slate-500">Itaperuna → Italva</p>
        </div>
        <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{hora}</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(100, (v.reservados / v.vagas) * 100)}%` }} />
        </div>
        <p className="text-sm text-slate-700">
          {v.reservados} de {v.vagas} alunos · {faltam > 0 ? `faltam ${faltam} para confirmar` : "confirmando…"}
        </p>
        {naLista ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-violet-700">
              <Hourglass className="size-4" /> Você está na lista
            </p>
            <Botao variante="secundario" onClick={() => void desistir()} disabled={pendente} className="h-9 px-3 text-xs">
              {pendente ? <Loader2 className="animate-spin" /> : <XCircle />} Desistir
            </Botao>
          </div>
        ) : (
          <Botao onClick={reservar} disabled={pendente} className="h-12 w-full bg-violet-600 text-base hover:bg-violet-700">
            {pendente ? <Loader2 className="animate-spin" /> : <TicketCheck />} Reservar volta {hora}
          </Botao>
        )}
        <p className="text-xs text-slate-500">
          Até confirmar, sua vaga das 22:00 continua garantida. Se não completar até as {hora}, você volta às 22:00, sem falta.
        </p>
      </div>
    </article>
  );
}
