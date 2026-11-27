"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, Bus, CheckCircle2, Clock3, Loader2, Minus, Plus, Users, XCircle } from "lucide-react";
import { Botao, cx } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";
import { liberarVolta2030 } from "./acoes";

type OnibusOpcao = { id: string; prefixo: string; placa: string; capacidade: number; fica: number; minimo: number; possivel: boolean };
export type InfoVolta2030 = {
  existe: boolean;
  pode_ver?: boolean;
  saida_em?: string;
  liberacao?: {
    status: "aberta" | "confirmada" | "cancelada";
    vagas: number;
    reservados: number;
    prefixo: string;
    liberada_por: string | null;
    minha: boolean;
  } | null;
  pode_liberar?: boolean;
  motivo?: string | null;
  reservas_22?: number;
  capacidade_22?: number;
  onibus?: OnibusOpcao[];
};

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Cartão da volta 20:30 de Itaperuna no app do motorista: liberar ou acompanhar (seção 9). */
export function Volta2030({ info }: { info: InfoVolta2030 }) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [escolhido, setEscolhido] = useState<OnibusOpcao | null>(null);
  const [vagas, setVagas] = useState(1);
  const [pendente, iniciar] = useTransition();
  const [janela, confirmar] = useConfirmacao();

  if (!info.existe || !info.pode_ver) return null;
  const hora = info.saida_em ? HORA.format(new Date(info.saida_em)) : "20:30";
  const l = info.liberacao;

  function escolher(o: OnibusOpcao) {
    setEscolhido(o);
    setVagas(o.minimo);
  }

  async function liberar() {
    if (!escolhido) return;
    if (!(await confirmar(`Liberar a volta ${hora} com o ônibus ${escolhido.prefixo} e mínimo de ${vagas} alunos? Depois de liberada, não dá para desfazer.`)))
      return;
    iniciar(async () => {
      const r = await liberarVolta2030(escolhido.id, vagas);
      if (r.ok) {
        toast.success(`Volta ${hora} liberada! Os alunos da volta das 22:00 já podem reservar.`);
        setAbrindo(false);
      } else toast.error(r.erro);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-suave ring-1 ring-violet-100">
      {janela}
      <div className="flex items-center gap-3 p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg">
          <ArrowDownLeft className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">Itaperuna → Italva</p>
          <p className="font-semibold text-slate-900">Volta {hora} (extra)</p>
        </div>
        {l && (
          <span className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">
            <Bus className="size-4" /> {l.prefixo}
          </span>
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        {l ? (
          l.status === "aberta" ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm text-slate-700">
                <Users className="size-4 text-violet-500" />
                <strong className="tabular-nums">{l.reservados}</strong> de {l.vagas} alunos reservaram
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(100, (l.reservados / l.vagas) * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-500">
                {l.minha ? "Você liberou." : `Liberada por ${l.liberada_por ?? "outro motorista"}.`} Se não completar até as {hora}, é cancelada e todos voltam às 22:00.
              </p>
            </div>
          ) : l.status === "confirmada" ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="size-5 shrink-0" /> Confirmada com {l.vagas} alunos. O ônibus {l.prefixo} sai assim que todos embarcarem.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <XCircle className="size-5 shrink-0 text-slate-400" /> Não completou o mínimo. Todos voltam às 22:00.
            </p>
          )
        ) : !info.pode_liberar ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Clock3 className="size-4 shrink-0" /> {info.motivo}
          </p>
        ) : !abrindo ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              <strong>{info.reservas_22}</strong> alunos na volta das 22:00.
            </p>
            <Botao onClick={() => setAbrindo(true)} className="h-11 bg-violet-600 px-4 hover:bg-violet-700">
              Liberar volta {hora}
            </Botao>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-slate-900">Qual ônibus sai às {hora}?</p>
            <div className="flex flex-col gap-2">
              {info.onibus?.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={!o.possivel}
                  onClick={() => escolher(o)}
                  className={cx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors disabled:opacity-50",
                    escolhido?.id === o.id ? "bg-violet-50 ring-2 ring-violet-500" : "bg-white ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  <span className="flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                    <Bus className="size-3.5" /> {o.prefixo}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-slate-600">
                    <span className="block font-medium text-slate-800">
                      {o.placa} · {o.capacidade} lugares
                    </span>
                    {o.possivel
                      ? `Ficam ${o.fica} lugares para as 22:00 → mínimo ${o.minimo}`
                      : "Os que ficam não levariam todos às 22:00"}
                  </span>
                </button>
              ))}
            </div>

            {escolhido && (
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-sm font-medium text-slate-800">Mínimo de alunos para confirmar</p>
                <p className="text-xs text-slate-500">
                  {info.reservas_22} na volta das 22:00; ficam {escolhido.fica} lugares → mínimo sugerido: {escolhido.minimo}.
                </p>
                <div className="mt-2 flex items-center justify-center gap-4">
                  <Botao variante="secundario" className="size-11 p-0" onClick={() => setVagas((x) => Math.max(escolhido.minimo, x - 1))} disabled={vagas <= escolhido.minimo} aria-label="Menos">
                    <Minus />
                  </Botao>
                  <span className="w-14 text-center text-3xl font-black tabular-nums text-slate-900">{vagas}</span>
                  <Botao variante="secundario" className="size-11 p-0" onClick={() => setVagas((x) => Math.min(escolhido.capacidade, x + 1))} disabled={vagas >= escolhido.capacidade} aria-label="Mais">
                    <Plus />
                  </Botao>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Botao variante="secundario" className="h-11 flex-1" onClick={() => setAbrindo(false)} disabled={pendente}>
                Voltar
              </Botao>
              <Botao className="h-11 flex-[2] bg-violet-600 hover:bg-violet-700" onClick={() => void liberar()} disabled={!escolhido || pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <ArrowDownLeft />} Liberar
              </Botao>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
