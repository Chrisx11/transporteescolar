"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { obterDispositivo } from "@/lib/device";
import { confirmarEmbarque } from "@/app/app/acoes";
import { ResultadoEmbarque, type Resultado } from "./resultado-embarque";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export function ConfirmarEmbarque({ token, nome }: { token: string; nome: string }) {
  const [r, setR] = useState<Resultado>({ fase: "localizando" });
  const iniciado = useRef(false);

  const tentar = useCallback(async () => {
    setR({ fase: "localizando" });
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
    setR({ fase: "enviando" });
    const resp = await confirmarEmbarque(token, lat, lng);
    setR(
      resp.ok
        ? { fase: "ok", nome, prefixo: resp.prefixo, viagem: resp.viagem, mensagem: resp.mensagem, hora: HORA.format(new Date()) }
        : { fase: "erro", nome, erro: resp.erro, semLocal: lat === null },
    );
  }, [token, nome]);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void tentar();
  }, [tentar]);

  return <ResultadoEmbarque r={r} aoTentar={() => void tentar()} />;
}
