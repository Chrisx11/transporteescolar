"use client";

import { useState } from "react";
import { ArrowDownLeft, ChevronDown } from "lucide-react";

/**
 * Voltas ainda não reservadas. Ficam recolhidas (o aluno reserva a volta junto
 * com a ida); abrem sozinhas quando faz sentido — ida reservada sem volta, ou
 * nenhuma ida disponível — e o aluno que vai só na volta pode abrir.
 */
export function SecaoVoltas({ abertaInicial, titulo, children }: { abertaInicial: boolean; titulo: string; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(abertaInicial);
  if (aberta)
    return (
      <section className="flex flex-col gap-4">
        <h2 className="px-1 text-sm font-semibold text-slate-600">{titulo}</h2>
        {children}
      </section>
    );
  return (
    <button
      type="button"
      onClick={() => setAberta(true)}
      className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-white"
    >
      <ArrowDownLeft className="size-4" /> Vai só na volta? Ver horários de volta <ChevronDown className="size-4" />
    </button>
  );
}
