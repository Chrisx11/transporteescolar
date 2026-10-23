"use client";

import { useEffect } from "react";
import { RotateCcw, ServerCrash } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui";

/** Erro inesperado numa página do painel (o menu continua funcionando). */
export default function ErroPainel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-red-50 text-red-500 ring-8 ring-red-50/60">
        <ServerCrash className="size-8" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Algo deu errado</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Não foi possível carregar esta página. Verifique a internet e tente de novo. Se continuar, avise o suporte
        {error.digest ? ` informando o código ${error.digest}` : ""}.
      </p>
      <div className="mt-6 flex gap-2">
        <Botao onClick={reset}>
          <RotateCcw /> Tentar de novo
        </Botao>
        <BotaoLink href="/painel" variante="secundario">
          Ir para o início
        </BotaoLink>
      </div>
    </div>
  );
}
