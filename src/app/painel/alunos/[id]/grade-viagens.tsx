"use client";

import { useMemo, useState } from "react";
import { Selecao, cx } from "@/components/ui";

export type OpcaoViagem = { id: string; rotulo: string; sentido: "ida" | "volta"; dias: number[] };
export type DiaGrade = { dia: number; ida: string | null; volta: string | null };

const DIAS = [
  { valor: 1, curto: "Seg", nome: "Segunda" },
  { valor: 2, curto: "Ter", nome: "Terça" },
  { valor: 3, curto: "Qua", nome: "Quarta" },
  { valor: 4, curto: "Qui", nome: "Quinta" },
  { valor: 5, curto: "Sex", nome: "Sexta" },
  { valor: 6, curto: "Sáb", nome: "Sábado" },
  { valor: 7, curto: "Dom", nome: "Domingo" },
];

/**
 * Viagens do aluno. Modo simples: uma ida, uma volta e os dias marcados.
 * "Dias com horário diferente" abre uma linha por dia. Os dois modos enviam
 * os mesmos campos (ida_<dia> e volta_<dia>) para o formulário.
 */
export function GradeViagens({ viagens, grade }: { viagens: OpcaoViagem[]; grade: DiaGrade[] }) {
  const dias = DIAS.filter((d) => d.valor <= 6 || viagens.some((v) => v.dias.includes(7)));
  const comViagem = grade.filter((g) => g.ida || g.volta);
  const uniforme = comViagem.every((g) => g.ida === comViagem[0]?.ida && g.volta === comViagem[0]?.volta);

  const [porDia, setPorDia] = useState(!uniforme);
  const [ida, setIda] = useState(comViagem[0]?.ida ?? "");
  const [volta, setVolta] = useState(comViagem[0]?.volta ?? "");
  const [marcados, setMarcados] = useState<number[]>(
    comViagem.length ? comViagem.map((g) => g.dia) : dias.filter((d) => d.valor <= 5).map((d) => d.valor),
  );
  const [linhas, setLinhas] = useState<Record<number, { ida: string; volta: string }>>(() =>
    Object.fromEntries(dias.map((d) => {
      const g = grade.find((x) => x.dia === d.valor);
      return [d.valor, { ida: g?.ida ?? "", volta: g?.volta ?? "" }];
    })),
  );

  const idas = viagens.filter((v) => v.sentido === "ida");
  const voltas = viagens.filter((v) => v.sentido === "volta");
  const opera = (id: string, dia: number) => !id || !!viagens.find((v) => v.id === id)?.dias.includes(dia);
  // No modo simples, só dá para marcar os dias em que as viagens escolhidas operam.
  const podeMarcar = useMemo(() => new Set(dias.filter((d) => opera(ida, d.valor) && opera(volta, d.valor)).map((d) => d.valor)), [ida, volta]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirPorDia() {
    setLinhas(Object.fromEntries(dias.map((d) => [d.valor, marcados.includes(d.valor) ? { ida, volta } : { ida: "", volta: "" }])));
    setPorDia(true);
  }

  if (porDia) {
    return (
      <div className="flex flex-col gap-2">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Dia</th>
                <th className="px-3 py-2">Ida</th>
                <th className="px-3 py-2">Volta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dias.map((d) => (
                <tr key={d.valor}>
                  <td className="px-3 py-2 font-medium">{d.nome}</td>
                  {(["ida", "volta"] as const).map((s) => (
                    <td key={s} className="px-3 py-2">
                      <Selecao
                        name={`${s}_${d.valor}`}
                        value={linhas[d.valor][s]}
                        onChange={(e) => setLinhas({ ...linhas, [d.valor]: { ...linhas[d.valor], [s]: e.target.value } })}
                      >
                        <option value="">— nenhuma —</option>
                        {(s === "ida" ? idas : voltas)
                          .filter((v) => v.dias.includes(d.valor))
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.rotulo}
                            </option>
                          ))}
                      </Selecao>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setPorDia(false)} className="self-start text-sm font-medium text-azul-700 hover:underline">
          Usar a mesma viagem em todos os dias
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Ida
          <Selecao value={ida} onChange={(e) => setIda(e.target.value)}>
            <option value="">— nenhuma —</option>
            {idas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Volta
          <Selecao value={volta} onChange={(e) => setVolta(e.target.value)}>
            <option value="">— nenhuma —</option>
            {voltas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </Selecao>
        </label>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Dias</p>
        <div className="flex flex-wrap gap-2">
          {dias.map((d) => {
            const pode = podeMarcar.has(d.valor);
            const ativo = pode && marcados.includes(d.valor);
            return (
              <button
                key={d.valor}
                type="button"
                disabled={!pode}
                title={pode ? undefined : "A viagem escolhida não opera neste dia"}
                onClick={() => setMarcados(ativo ? marcados.filter((x) => x !== d.valor) : [...marcados, d.valor])}
                className={cx(
                  "h-10 min-w-14 rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition-colors",
                  ativo ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                  !pode && "cursor-not-allowed opacity-40",
                )}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </div>
      {dias.map((d) => {
        const ativo = podeMarcar.has(d.valor) && marcados.includes(d.valor);
        return (
          <span key={d.valor} hidden>
            <input type="hidden" name={`ida_${d.valor}`} value={ativo ? ida : ""} />
            <input type="hidden" name={`volta_${d.valor}`} value={ativo ? volta : ""} />
          </span>
        );
      })}
      <button type="button" onClick={abrirPorDia} className="self-start text-sm font-medium text-azul-700 hover:underline">
        Dias com horário diferente
      </button>
    </div>
  );
}
