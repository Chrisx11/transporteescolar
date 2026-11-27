import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarClock, CheckCircle2, CircleSlash, FileCheck2, Hourglass, ShieldCheck, UserX, XCircle } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Vazio, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Histórico" };

type Linha = {
  reserva_id: string;
  data: string;
  nome: string;
  cidade: string;
  sentido: "ida" | "volta";
  saida_em: string;
  status_viagem: string;
  embarcado: boolean;
  frequencia_id: number | null;
  resultado: string | null;
  justificativa_status: "pendente" | "aprovada" | "recusada" | "cancelada" | null;
  justificativa_resposta: string | null;
  pode_justificar: boolean;
};

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" });

function situacao(l: Linha): { rotulo: string; cor: string; icone: typeof CheckCircle2 } {
  if (l.resultado === "presente" || (l.embarcado && !l.resultado)) return { rotulo: "Embarcou", cor: "bg-emerald-50 text-emerald-700", icone: CheckCircle2 };
  if (l.resultado === "falta") return { rotulo: "Falta", cor: "bg-red-50 text-red-700", icone: UserX };
  if (l.resultado === "justificada") return { rotulo: "Falta justificada", cor: "bg-azul-50 text-azul-700", icone: ShieldCheck };
  if (l.resultado === "nao_retornou") return { rotulo: "Não retornou", cor: "bg-amber-50 text-amber-700", icone: CircleSlash };
  if (l.resultado === "anulada") return { rotulo: "Viagem com ocorrência", cor: "bg-slate-100 text-slate-600", icone: CircleSlash };
  return { rotulo: "Reservada", cor: "bg-slate-100 text-slate-600", icone: CalendarClock };
}

/** Histórico do aluno: reservas, embarques, faltas e "não retornou" (últimos 90 dias). */
export default async function PaginaHistorico() {
  await exigirPerfil("aluno");
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("meu_historico", { p_dias: 90 });
  const linhas = (data ?? []) as Linha[];
  const conta = (r: string) => linhas.filter((l) => l.resultado === r).length;
  const resumo = [
    { rotulo: "Embarques", valor: linhas.filter((l) => l.resultado === "presente").length, cor: "text-emerald-600" },
    { rotulo: "Faltas", valor: conta("falta"), cor: "text-red-600" },
    { rotulo: "Justificadas", valor: conta("justificada"), cor: "text-azul-600" },
    { rotulo: "Não retornou", valor: conta("nao_retornou"), cor: "text-amber-600" },
  ];

  const porDia = new Map<string, Linha[]>();
  for (const l of linhas) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <Link href="/app" className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Últimos 90 dias</p>
          <p className="font-semibold text-slate-900">Histórico e faltas</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {resumo.map((r) => (
          <div key={r.rotulo} className="rounded-2xl bg-white p-3 text-center shadow-suave">
            <p className={cx("text-2xl font-black tabular-nums", r.cor)}>{r.valor}</p>
            <p className="text-[11px] font-medium leading-tight text-slate-500">{r.rotulo}</p>
          </div>
        ))}
      </div>

      {linhas.some((l) => l.pode_justificar) && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Faltou por um motivo importante (doença, por exemplo)? Toque em <strong>Justificar</strong> na falta e envie o atestado.
        </p>
      )}

      {linhas.length === 0 ? (
        <Vazio icone={CalendarClock}>Nenhuma viagem nos últimos 90 dias.</Vazio>
      ) : (
        [...porDia.entries()].map(([dia, itens]) => (
          <section key={dia} className="flex flex-col gap-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{DIA.format(new Date(dia + "T12:00:00Z"))}</p>
            {itens.map((l) => {
              const s = situacao(l);
              const Icone = s.icone;
              return (
                <div key={l.reserva_id} className="rounded-2xl bg-white p-4 shadow-suave">
                  <div className="flex items-center gap-3">
                    <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", l.sentido === "ida" ? "bg-azul-50 text-azul-600" : "bg-violet-50 text-violet-600")}>
                      {l.sentido === "ida" ? <ArrowUpRight className="size-5" /> : <ArrowDownLeft className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{l.nome}</p>
                      <p className="text-xs text-slate-500">
                        {l.cidade === "campos" ? "Campos" : "Itaperuna"} · {HORA.format(new Date(l.saida_em))}
                      </p>
                    </div>
                    <span className={cx("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", s.cor)}>
                      <Icone className="size-3.5" /> {s.rotulo}
                    </span>
                  </div>

                  {l.justificativa_status === "pendente" && (
                    <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Hourglass className="size-4 shrink-0" /> Justificativa enviada. A Secretaria de Educação vai analisar.
                    </p>
                  )}
                  {l.justificativa_status === "recusada" && l.resultado === "falta" && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                      <span>
                        Justificativa recusada{l.justificativa_resposta ? `: ${l.justificativa_resposta}` : "."}
                        {l.pode_justificar && " Você pode enviar outra."}
                      </span>
                    </p>
                  )}
                  {l.pode_justificar && (
                    <Link
                      href={`/app/historico/justificar/${l.frequencia_id}`}
                      className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      <FileCheck2 className="size-4" /> Justificar esta falta
                    </Link>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
