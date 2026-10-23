"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Bus,
  CheckCircle2,
  Clock3,
  Hourglass,
  Loader2,
  MapPin,
  TicketCheck,
  XCircle,
} from "lucide-react";
import { Botao, cx } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";
import { CIDADES_CURTO } from "@/lib/rotulos";
import { tempoRestante, type MinhaViagem } from "@/lib/viagens";
import { cancelarReserva, reservarViagem } from "./acoes";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DIA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const mesmoDia = (a: Date, b: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(a) ===
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(b);

/** Relógio que atualiza a cada 30 s (contagem regressiva do prazo). */
function useAgora() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

export function CartaoViagem({ v }: { v: MinhaViagem }) {
  const router = useRouter();
  const agora = useAgora();
  const [pendente, iniciar] = useTransition();
  const [janela, confirmar] = useConfirmacao();
  const ida = v.sentido === "ida";
  const Icone = ida ? ArrowUpRight : ArrowDownLeft;
  const saida = new Date(v.saida_em);
  const prazo = v.prazo_em ? new Date(v.prazo_em) : null;
  const restante = prazo ? prazo.getTime() - agora : 0;
  const reservado = !!v.reserva_id;
  const cancelada = v.status_viagem === "cancelada";

  // Quando o prazo vence com a tela aberta, recarrega para mostrar o ônibus.
  const venceu = !!v.prazo_em && restante <= 0;
  useEffect(() => {
    if (venceu && v.status_viagem === "agendada") router.refresh();
  }, [venceu, v.status_viagem, router]);

  function reservar() {
    if (!v.viagem_dia_id) return;
    iniciar(async () => {
      const r = await reservarViagem(v.viagem_dia_id!);
      if (r.ok) toast.success(`${v.nome} reservada!`);
      else toast.error(r.erro);
      router.refresh();
    });
  }

  async function cancelar() {
    if (!v.reserva_id || !(await confirmar(`Cancelar sua reserva da ${v.nome.toLowerCase()}?`))) return;
    iniciar(async () => {
      const r = await cancelarReserva(v.reserva_id!);
      if (r.ok) toast.success("Reserva cancelada.");
      else toast.error(r.erro);
      router.refresh();
    });
  }

  // "Até 15:00 · faltam 2h 10min" ou, se o prazo é no dia anterior, "Até dom., 25/10 19:00 · …"
  const textoPrazo = prazo
    ? `Até ${mesmoDia(prazo, saida) ? HORA.format(prazo) : DIA_HORA.format(prazo)} · faltam ${tempoRestante(restante)}`
    : null;

  return (
    <article
      className={cx(
        "overflow-hidden rounded-3xl bg-white shadow-suave ring-1 transition-shadow",
        reservado && !cancelada ? "ring-emerald-200" : "ring-transparent",
      )}
    >
      {janela}
      <div className="flex items-center gap-4 p-5">
        <span
          className={cx(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
            ida ? "from-azul-500 to-azul-700" : "from-emerald-400 to-teal-600",
          )}
        >
          <Icone className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ida ? "Ida" : "Volta"}</p>
          <p className="truncate font-semibold text-slate-900">{v.nome}</p>
          <p className="flex items-center gap-1 truncate text-sm text-slate-500">
            <MapPin className="size-3.5 shrink-0" />
            {ida ? `Italva → ${CIDADES_CURTO[v.cidade]}` : `${CIDADES_CURTO[v.cidade]} → Italva`}
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-xs text-slate-400">
            <Clock3 className="size-3.5" /> saída
          </p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{HORA.format(saida)}</p>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        {cancelada ? (
          <Faixa icone={Ban} cor="text-red-600" titulo="Viagem cancelada" texto="Veja os avisos para saber o motivo." />
        ) : reservado && v.pode_cancelar ? (
          <div className="flex items-center justify-between gap-3">
            <Faixa icone={CheckCircle2} cor="text-emerald-600" titulo="Reservado" texto={textoPrazo ?? undefined} />
            <Botao variante="secundario" onClick={cancelar} disabled={pendente} className="h-9 px-3 text-xs">
              {pendente ? <Loader2 className="animate-spin" /> : <XCircle />} Cancelar
            </Botao>
          </div>
        ) : reservado ? (
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-azul-600 text-white shadow-lg shadow-azul-600/30">
              <Bus className="size-4 opacity-80" />
              <span className="text-lg font-black leading-none">{v.onibus_prefixo ?? "–"}</span>
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">
                {v.onibus_prefixo ? `Seu ônibus: ${v.onibus_prefixo}` : "Definindo seu ônibus…"}
              </p>
              <p className="truncate text-sm text-slate-500">
                {v.ponto_nome ? `Embarque: ${v.ponto_nome}` : "Ponto de embarque não definido — fale com a secretaria."}
              </p>
            </div>
          </div>
        ) : !v.motivo ? (
          <div className="flex items-center justify-between gap-3">
            <Faixa icone={Hourglass} cor="text-azul-600" titulo="Reserva aberta" texto={textoPrazo ?? undefined} />
            <Botao onClick={reservar} disabled={pendente} className="h-11 px-5">
              {pendente ? <Loader2 className="animate-spin" /> : <TicketCheck />} Reservar
            </Botao>
          </div>
        ) : v.motivo === "ainda_nao_abriu" && v.abertura_em ? (
          <Faixa
            icone={Clock3}
            cor="text-slate-500"
            titulo="Reserva ainda não abriu"
            texto={`Abre ${DIA_HORA.format(new Date(v.abertura_em)).replace(",", "")}`}
          />
        ) : v.motivo === "prazo_encerrado" ? (
          <Faixa icone={Ban} cor="text-slate-400" titulo="Prazo encerrado" texto="Você não reservou esta viagem." />
        ) : (
          <Faixa icone={Ban} cor="text-amber-600" titulo="Reserva indisponível" texto={v.mensagem ?? undefined} />
        )}
      </div>
    </article>
  );
}

function Faixa({
  icone: Icone,
  cor,
  titulo,
  texto,
}: {
  icone: typeof Ban;
  cor: string;
  titulo: string;
  texto?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icone className={cx("mt-0.5 size-5 shrink-0", cor)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{titulo}</p>
        {texto && <p className="text-xs text-slate-500">{texto}</p>}
      </div>
    </div>
  );
}
