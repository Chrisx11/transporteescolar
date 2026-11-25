"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

type Cidade = "italva" | "campos" | "itaperuna";

/**
 * Ida = ponto em Italva (embarque das idas e desembarque das voltas).
 * Volta = ponto na cidade da faculdade (Campos ou Itaperuna).
 * O formulário envia só a cidade (campo "cidade").
 */
export function TipoPonto({ cidade }: { cidade?: Cidade }) {
  const [tipo, setTipo] = useState<"ida" | "volta" | null>(cidade ? (cidade === "italva" ? "ida" : "volta") : null);
  const [destino, setDestino] = useState<"campos" | "itaperuna" | null>(cidade && cidade !== "italva" ? cidade : null);
  const valor = tipo === "ida" ? "italva" : tipo === "volta" ? (destino ?? "") : "";

  const opcao = (ativo: boolean, aoClicar: () => void, titulo: string, texto: string) => (
    <button
      type="button"
      onClick={aoClicar}
      className={cx(
        "flex flex-1 flex-col items-start rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
        ativo ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
      )}
    >
      <span className="text-sm font-semibold">{titulo}</span>
      <span className={cx("text-xs", ativo ? "text-azul-100" : "text-slate-500")}>{texto}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="cidade" value={valor} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Este ponto é de</p>
        <div className="flex gap-2">
          {opcao(tipo === "ida", () => setTipo("ida"), "Ida", "Em Italva")}
          {opcao(tipo === "volta", () => setTipo("volta"), "Volta", "Na faculdade")}
        </div>
      </div>
      {tipo === "volta" && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Em qual cidade?</p>
          <div className="flex gap-2">
            {opcao(destino === "campos", () => setDestino("campos"), "Campos", "dos Goytacazes")}
            {opcao(destino === "itaperuna", () => setDestino("itaperuna"), "Itaperuna", "")}
          </div>
        </div>
      )}
      {tipo && !valor && <p className="text-xs text-amber-700">Escolha a cidade da volta.</p>}
    </div>
  );
}
