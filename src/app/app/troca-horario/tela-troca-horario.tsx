"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, Hourglass, Loader2, Repeat2, Send, XCircle } from "lucide-react";
import { Campo, cx } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";
import { diaSemanaIso } from "@/lib/tempo";
import { desistirExcecao, pedirExcecao } from "./acoes";

export type Modelo = { id: string; nome: string; cidade: string; sentido: "ida" | "volta"; hora_saida: string; dias_semana: number[] };
type Viagem = { nome: string; cidade: string; hora_saida: string } | null;
export type Pedido = {
  id: string;
  data: string;
  motivo: string;
  status: "pendente" | "aprovada" | "recusada" | "cancelada";
  resposta: string | null;
  ida: Viagem;
  volta: Viagem;
};

const CIDADE: Record<string, string> = { campos: "Campos", itaperuna: "Itaperuna" };
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });
const dataLonga = (d: string) => DATA.format(new Date(d + "T12:00:00Z"));
const hora = (h: string) => h.slice(0, 5);
const rotuloViagem = (v: { nome: string; cidade: string; hora_saida: string }) => `${CIDADE[v.cidade] ?? v.cidade} · ${v.nome} (${hora(v.hora_saida)})`;

const STATUS = {
  pendente: { rotulo: "Em análise", cor: "bg-amber-50 text-amber-700", icone: Hourglass },
  aprovada: { rotulo: "Aprovada", cor: "bg-emerald-50 text-emerald-700", icone: CheckCircle2 },
  recusada: { rotulo: "Recusada", cor: "bg-red-50 text-red-700", icone: XCircle },
  cancelada: { rotulo: "Cancelada", cor: "bg-slate-100 text-slate-500", icone: XCircle },
};

export function TelaTrocaHorario({ modelos, pedidos, hoje, maximo }: { modelos: Modelo[]; pedidos: Pedido[]; hoje: string; maximo: string }) {
  const router = useRouter();
  const [data, setData] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, iniciar] = useTransition();
  const [janela, confirmar] = useConfirmacao();

  // Só as viagens que acontecem no dia da semana escolhido.
  const doDia = useMemo(() => {
    if (!data) return [];
    const dia = diaSemanaIso(data);
    return modelos.filter((m) => m.dias_semana.includes(dia));
  }, [data, modelos]);
  const idas = doDia.filter((m) => m.sentido === "ida");
  const idaEscolhida = idas.find((m) => m.id === ida);
  // Com ida escolhida, a volta precisa ser da mesma cidade e sair depois.
  const voltas = doDia.filter((m) => m.sentido === "volta" && (!idaEscolhida || (m.cidade === idaEscolhida.cidade && m.hora_saida > idaEscolhida.hora_saida)));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return toast.error("Escolha a data.");
    if (!ida && !volta) return toast.error("Escolha a ida, a volta ou as duas.");
    iniciar(async () => {
      const r = await pedirExcecao({ data, ida: ida || null, volta: volta || null, motivo });
      if (r.ok) {
        toast.success("Pedido enviado! Você recebe um aviso quando a Secretaria de Educação analisar.");
        setData("");
        setIda("");
        setVolta("");
        setMotivo("");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  async function desistir(p: Pedido) {
    if (!(await confirmar(`Cancelar o pedido de ${dataLonga(p.data)}?${p.status === "aprovada" ? " Nesse dia volta a valer o seu horário normal." : ""}`))) return;
    const r = await desistirExcecao(p.id);
    if (r.ok) {
      toast.success("Pedido cancelado.");
      router.refresh();
    } else toast.error(r.erro);
  }

  const selecao = "h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-azul-400 focus:ring-2 focus:ring-azul-100 disabled:bg-slate-50";

  return (
    <div className="flex flex-col gap-4">
      {janela}
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <Link href="/app" className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Exceção de data</p>
          <p className="font-semibold text-slate-900">Trocar horário num dia</p>
        </div>
      </div>

      <p className="rounded-2xl bg-azul-50 px-4 py-3 text-sm text-azul-900">
        Tem prova ou aula em outro horário num dia específico? Peça aqui. Se a Secretaria de Educação aprovar, a viagem pedida aparece no app
        <strong> só naquele dia</strong>, no lugar da sua, e você reserva dentro do prazo normal.
      </p>

      <form onSubmit={enviar} className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-suave">
        <Campo rotulo="Qual dia?">
          <input
            type="date"
            value={data}
            min={hoje}
            max={maximo}
            onChange={(e) => {
              setData(e.target.value);
              setIda("");
              setVolta("");
            }}
            className={selecao}
            required
          />
        </Campo>
        <Campo rotulo="Ida" ajuda={data && idas.length === 0 ? "Nenhuma ida nesse dia." : "Deixe em branco se a ida continua a mesma."}>
          <select value={ida} onChange={(e) => {
              setIda(e.target.value);
              setVolta("");
            }} disabled={!data} className={selecao}>
            <option value="">— Manter a minha ida —</option>
            {idas.map((m) => (
              <option key={m.id} value={m.id}>
                {rotuloViagem(m)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Volta" ajuda="Deixe em branco se a volta continua a mesma.">
          <select value={volta} onChange={(e) => setVolta(e.target.value)} disabled={!data} className={selecao}>
            <option value="">— Manter a minha volta —</option>
            {voltas.map((m) => (
              <option key={m.id} value={m.id}>
                {rotuloViagem(m)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Motivo">
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: prova no turno da tarde neste dia."
            className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-base outline-none focus:border-azul-400 focus:ring-2 focus:ring-azul-100"
            required
          />
        </Campo>
        <button
          type="submit"
          disabled={enviando}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-azul-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
        >
          {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} Enviar pedido
        </button>
      </form>

      {pedidos.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Meus pedidos</p>
          {pedidos.map((p) => {
            const s = STATUS[p.status];
            const Icone = s.icone;
            const podeCancelar = (p.status === "pendente" || p.status === "aprovada") && p.data >= hoje;
            return (
              <div key={p.id} className="rounded-2xl bg-white p-4 shadow-suave">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-azul-50 text-azul-600">
                    <CalendarDays className="size-5" />
                  </span>
                  <p className="min-w-0 flex-1 font-semibold text-slate-900 first-letter:uppercase">{dataLonga(p.data)}</p>
                  <span className={cx("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", s.cor)}>
                    <Icone className="size-3.5" /> {s.rotulo}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-1 text-sm text-slate-600">
                  {p.ida && (
                    <p className="flex items-center gap-2">
                      <ArrowUpRight className="size-4 text-azul-600" /> {rotuloViagem(p.ida)}
                    </p>
                  )}
                  {p.volta && (
                    <p className="flex items-center gap-2">
                      <ArrowDownLeft className="size-4 text-violet-600" /> {rotuloViagem(p.volta)}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">Motivo: {p.motivo}</p>
                  {p.resposta && <p className="text-xs text-slate-500">Resposta da secretaria: {p.resposta}</p>}
                </div>
                {podeCancelar && (
                  <button type="button" onClick={() => void desistir(p)} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-red-600">
                    <Repeat2 className="size-4" /> Cancelar pedido
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
