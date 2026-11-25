"use client";

import Link from "next/link";
import { Bus, CheckCircle2, Loader2, MapPinOff, RotateCcw, XCircle } from "lucide-react";

/**
 * Tela cheia de resultado do QR, feita para o motorista enxergar de longe:
 * verde = embarque confirmado; vermelho = não confirmado.
 */
export type Resultado =
  | { fase: "localizando" }
  | { fase: "enviando" }
  | { fase: "ok"; nome: string; prefixo: string | null; viagem: string; mensagem: string; hora: string }
  | { fase: "erro"; nome: string; erro: string; semLocal: boolean };

export function ResultadoEmbarque({ r, aoTentar }: { r: Resultado; aoTentar?: () => void }) {
  if (r.fase === "localizando" || r.fase === "enviando") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-azul-700 p-6 text-center text-white">
        <span className="flex size-24 items-center justify-center rounded-3xl bg-white/15">
          <Bus className="size-12" />
        </span>
        <p className="flex items-center gap-3 text-2xl font-bold">
          <Loader2 className="size-7 animate-spin" />
          {r.fase === "localizando" ? "Conferindo sua localização…" : "Confirmando o embarque…"}
        </p>
        <p className="max-w-xs text-base text-azul-100">Se o celular perguntar, permita o acesso à localização.</p>
      </div>
    );
  }

  const primeiroNome = r.nome.split(" ")[0];

  if (r.fase === "ok") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-emerald-500 p-6 text-center text-white">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <CheckCircle2 className="size-36 drop-shadow-lg" strokeWidth={2.5} />
          <p className="text-5xl font-black uppercase leading-none tracking-tight drop-shadow">Embarque</p>
          <p className="text-5xl font-black uppercase leading-none tracking-tight drop-shadow">confirmado</p>
          <p className="mt-2 text-3xl font-bold">{primeiroNome}</p>
          {r.prefixo && (
            <div className="mt-2 flex flex-col items-center rounded-3xl bg-white px-10 py-3 text-emerald-700 shadow-xl">
              <span className="text-sm font-bold uppercase tracking-widest">Ônibus</span>
              <span className="text-7xl font-black leading-none">{r.prefixo}</span>
            </div>
          )}
          <p className="mt-1 text-lg font-medium text-emerald-50">
            {r.viagem} · {r.hora}
          </p>
          <p className="text-sm text-emerald-50/90">{r.mensagem}</p>
        </div>
        <Link
          href="/app"
          className="flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-white/20 text-lg font-semibold ring-2 ring-white/60"
        >
          Voltar para o início
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-red-600 p-6 text-center text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <XCircle className="size-36 drop-shadow-lg" strokeWidth={2.5} />
        <p className="text-5xl font-black uppercase leading-none tracking-tight drop-shadow">Não</p>
        <p className="text-5xl font-black uppercase leading-none tracking-tight drop-shadow">confirmado</p>
        <p className="mt-2 text-3xl font-bold">{primeiroNome}</p>
        <p className="mt-2 max-w-sm rounded-2xl bg-white px-5 py-4 text-xl font-semibold leading-snug text-red-700 shadow-xl">{r.erro}</p>
        {r.semLocal && (
          <p className="flex max-w-sm items-start gap-2 text-left text-base text-red-50">
            <MapPinOff className="mt-0.5 size-5 shrink-0" />
            Não conseguimos a localização do celular. Ative a localização e permita o acesso para este site.
          </p>
        )}
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        {aoTentar && (
          <button
            onClick={aoTentar}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-red-700 shadow-lg"
          >
            <RotateCcw className="size-5" /> Tentar de novo
          </button>
        )}
        <Link href="/app" className="text-base font-semibold text-red-50 underline-offset-4 hover:underline">
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
