"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bus, CheckCircle2, Loader2, MapPinOff, RotateCcw, XCircle } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui";
import { obterDispositivo } from "@/lib/device";
import { confirmarEmbarque, type RespostaEmbarque } from "@/app/app/acoes";

type Estado = { fase: "localizando" } | { fase: "enviando" } | { fase: "fim"; r: RespostaEmbarque; semLocal: boolean };

export function ConfirmarEmbarque({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "localizando" });
  const iniciado = useRef(false);

  const tentar = useCallback(async () => {
    setEstado({ fase: "localizando" });
    let lat: number | null = null;
    let lng: number | null = null;
    // A localização é usada só agora, para comparar com a do motorista (não fica guardada).
    try {
      const p = await obterDispositivo().localizacao.posicaoAtual();
      lat = p.lat;
      lng = p.lng;
    } catch {
      // Sem localização: o servidor decide (aceita se o motorista não enviou posição recente).
    }
    setEstado({ fase: "enviando" });
    const r = await confirmarEmbarque(token, lat, lng);
    setEstado({ fase: "fim", r, semLocal: lat === null });
  }, [token]);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void tentar();
  }, [tentar]);

  if (estado.fase !== "fim") {
    return (
      <div className="flex flex-col items-center gap-4">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-azul-600 text-white shadow-lg shadow-azul-600/30">
          <Bus className="size-9" />
        </span>
        <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Loader2 className="size-5 animate-spin" />
          {estado.fase === "localizando" ? "Conferindo sua localização…" : "Confirmando o embarque…"}
        </p>
        <p className="max-w-xs text-sm text-slate-500">Se o celular perguntar, permita o acesso à localização.</p>
      </div>
    );
  }

  const { r, semLocal } = estado;
  if (r.ok) {
    return (
      <div className="flex w-full flex-col items-center gap-5">
        <span className="flex size-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="size-12" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Embarque confirmado!</h1>
          <p className="mt-1 text-slate-600">{r.mensagem}</p>
          <p className="mt-1 text-sm text-slate-500">{r.viagem}</p>
        </div>
        {r.prefixo && (
          <div className="flex flex-col items-center rounded-2xl bg-white px-8 py-4 shadow-suave">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Ônibus</span>
            <span className="text-5xl font-black text-azul-700">{r.prefixo}</span>
          </div>
        )}
        <BotaoLink href="/app" className="w-full">
          Voltar para o início
        </BotaoLink>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <span className="flex size-24 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30">
        <XCircle className="size-12" />
      </span>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Embarque não confirmado</h1>
        <p className="mt-2 text-slate-700">{r.erro}</p>
      </div>
      {semLocal && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-left text-sm text-amber-800">
          <MapPinOff className="mt-0.5 size-4 shrink-0" />
          Não conseguimos a localização do seu celular. Ative a localização e permita o acesso para este site.
        </p>
      )}
      <Botao onClick={() => void tentar()} className="w-full">
        <RotateCcw /> Tentar de novo
      </Botao>
      <Link href="/app" className="text-sm font-medium text-azul-700">
        Voltar para o início
      </Link>
    </div>
  );
}
