"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cx } from "@/components/ui";

export type Rota = {
  id: string;
  cidade: "campos" | "itaperuna";
  nome: string;
  sentido: "ida" | "volta";
  hora: string;
  dias: number[];
};

const CIDADES = { campos: "Campos", itaperuna: "Itaperuna" } as const;
const DIAS_CURTOS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function textoDias(dias: number[]) {
  const ord = [...dias].sort();
  if (ord.join() === "1,2,3,4,5,6") return "seg a sáb";
  if (ord.join() === "1,2,3,4,5") return "seg a sex";
  return ord.map((d) => DIAS_CURTOS[d]).join(", ");
}

/**
 * Rotas que o aluno pode reservar. Escolhe a cidade (Campos, Itaperuna ou ambas)
 * e marca as idas e voltas. Só as rotas das cidades marcadas são salvas.
 */
export function RotasAluno({ rotas, selecionadas }: { rotas: Rota[]; selecionadas: string[] }) {
  const cidadesIniciais = new Set(rotas.filter((r) => selecionadas.includes(r.id)).map((r) => r.cidade));
  const [cidades, setCidades] = useState({ campos: cidadesIniciais.has("campos"), itaperuna: cidadesIniciais.has("itaperuna") });
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(selecionadas));
  const ambos = cidades.campos && cidades.itaperuna;

  const alternar = (id: string) => {
    const novo = new Set(marcadas);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setMarcadas(novo);
  };
  const visiveis = rotas.filter((r) => cidades[r.cidade]);
  const enviadas = visiveis.filter((r) => marcadas.has(r.id));

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="rotas_enviadas" value="1" />
      {enviadas.map((r) => (
        <input key={r.id} type="hidden" name="viagens" value={r.id} />
      ))}

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Cidade onde estuda</p>
        <div className="flex flex-wrap gap-2">
          <Caixa marcada={cidades.campos && !ambos} aoMudar={() => setCidades({ campos: !(cidades.campos && !ambos), itaperuna: false })}>
            Campos
          </Caixa>
          <Caixa marcada={cidades.itaperuna && !ambos} aoMudar={() => setCidades({ campos: false, itaperuna: !(cidades.itaperuna && !ambos) })}>
            Itaperuna
          </Caixa>
          <Caixa marcada={ambos} aoMudar={() => setCidades(ambos ? { campos: false, itaperuna: false } : { campos: true, itaperuna: true })}>
            Ambos
          </Caixa>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Marque a cidade para ver as rotas.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["ida", "volta"] as const).map((sentido) => {
            const doSentido = visiveis.filter((r) => r.sentido === sentido);
            const Icone = sentido === "ida" ? ArrowUpRight : ArrowDownLeft;
            return (
              <div key={sentido} className="overflow-hidden rounded-xl border border-slate-200">
                <p
                  className={cx(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold",
                    sentido === "ida" ? "bg-azul-50 text-azul-800" : "bg-emerald-50 text-emerald-800",
                  )}
                >
                  <Icone className="size-4" /> {sentido === "ida" ? "Idas (Italva → faculdade)" : "Voltas (faculdade → Italva)"}
                  <span className="ml-auto text-xs font-normal opacity-80">
                    {doSentido.filter((r) => marcadas.has(r.id)).length} de {doSentido.length}
                  </span>
                </p>
                {doSentido.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">Nenhuma rota.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {doSentido.map((r) => (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={marcadas.has(r.id)}
                            onChange={() => alternar(r.id)}
                            className="size-4 rounded border-slate-300 accent-azul-600"
                          />
                          <span className="w-12 font-semibold tabular-nums text-slate-900">{r.hora}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-800">
                            {r.nome}
                            {ambos && <span className="text-slate-400"> · {CIDADES[r.cidade]}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">{textoDias(r.dias)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500">O aluno pode reservar as rotas marcadas em todos os dias em que elas operam.</p>
    </div>
  );
}

function Caixa({ marcada, aoMudar, children }: { marcada: boolean; aoMudar: () => void; children: React.ReactNode }) {
  return (
    <label
      className={cx(
        "flex h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-inset transition-colors",
        marcada ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
      )}
    >
      <input type="checkbox" checked={marcada} onChange={aoMudar} className="size-4 accent-white" />
      {children}
    </label>
  );
}
