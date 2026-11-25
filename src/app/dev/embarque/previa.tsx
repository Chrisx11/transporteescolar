"use client";

import Link from "next/link";
import { ResultadoEmbarque, type Resultado } from "@/app/embarque/[token]/resultado-embarque";

const EXEMPLOS: Record<string, Resultado> = {
  ok: {
    fase: "ok",
    nome: "Leonardo Silva de Almeida",
    prefixo: "01",
    viagem: "ITAPERUNA NOITE REDENTOR",
    mensagem: "Embarque confirmado no ônibus 01.",
    hora: "10:12",
  },
  longe: {
    fase: "erro",
    nome: "Leonardo Silva de Almeida",
    erro: "Você está longe do ônibus (cerca de 850 m). Chegue perto do ônibus e leia o QR de novo.",
    semLocal: false,
  },
  onibus: {
    fase: "erro",
    nome: "Leonardo Silva de Almeida",
    erro: "Este ônibus não faz a sua viagem. Seu ônibus é o prefixo 02.",
    semLocal: false,
  },
  semlocal: {
    fase: "erro",
    nome: "Leonardo Silva de Almeida",
    erro: "Permita o acesso à localização do celular para confirmar o embarque.",
    semLocal: true,
  },
  carregando: { fase: "enviando" },
};

export function Previa({ estado }: { estado: string }) {
  const r = EXEMPLOS[estado] ?? EXEMPLOS.ok;
  return (
    <>
      <ResultadoEmbarque r={r} aoTentar={() => {}} />
      <nav className="fixed inset-x-0 top-0 z-[60] flex flex-wrap justify-center gap-1 bg-black/60 p-1.5 text-xs text-white">
        {Object.keys(EXEMPLOS).map((k) => (
          <Link key={k} href={`/dev/embarque?estado=${k}`} className={k === estado ? "rounded bg-white px-2 py-0.5 text-black" : "px-2 py-0.5"}>
            {k}
          </Link>
        ))}
      </nav>
    </>
  );
}
