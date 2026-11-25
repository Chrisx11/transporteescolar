"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

type Cidade = "italva" | "campos" | "itaperuna";
type Destino = "campos" | "itaperuna";

/**
 * Grupo do ponto:
 *   Ida · Italva x Campos / Italva x Itaperuna → ponto em Italva, da linha escolhida;
 *   Volta · Campos x Italva / Itaperuna x Italva → ponto na cidade da faculdade.
 * O formulário envia "cidade" (onde fica o ponto) e "linha" (Campos ou Itaperuna).
 */
export function TipoPonto({ cidade, linha }: { cidade?: Cidade; linha?: Destino | null }) {
  const [tipo, setTipo] = useState<"ida" | "volta" | null>(cidade ? (cidade === "italva" ? "ida" : "volta") : null);
  const [destino, setDestino] = useState<Destino | null>(cidade && cidade !== "italva" ? cidade : (linha ?? null));
  const valorCidade = tipo === "ida" ? "italva" : tipo === "volta" ? (destino ?? "") : "";

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
      {texto && <span className={cx("text-xs", ativo ? "text-azul-100" : "text-slate-500")}>{texto}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="cidade" value={valorCidade} />
      <input type="hidden" name="linha" value={tipo ? (destino ?? "") : ""} />
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Este ponto é de</p>
        <div className="flex gap-2">
          {opcao(tipo === "ida", () => setTipo("ida"), "Ida", "Fica em Italva")}
          {opcao(tipo === "volta", () => setTipo("volta"), "Volta", "Fica na faculdade")}
        </div>
      </div>
      {tipo && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">{tipo === "ida" ? "Linha (para onde vai)" : "Em qual cidade?"}</p>
          <div className="flex gap-2">
            {opcao(destino === "campos", () => setDestino("campos"), tipo === "ida" ? "Italva x Campos" : "Campos x Italva", "")}
            {opcao(destino === "itaperuna", () => setDestino("itaperuna"), tipo === "ida" ? "Italva x Itaperuna" : "Itaperuna x Italva", "")}
          </div>
        </div>
      )}
      {tipo && !destino && (
        <p className="text-xs text-amber-700">{tipo === "ida" ? "Escolha a linha." : "Escolha a cidade da volta."}</p>
      )}
    </div>
  );
}
