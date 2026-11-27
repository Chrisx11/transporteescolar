"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowLeft,
  Ban,
  BellOff,
  BellRing,
  Bus,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Loader2,
  MapPin,
  Send,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { useNotificacoes } from "@/lib/notificacoes-push";
import type { QualApp } from "@/components/instalar-app";
import { cx } from "@/components/ui";
import { alterarLembretes, enviarTeste } from "./acoes";

const O_QUE_CHEGA: Record<QualApp, { icone: typeof Bus; texto: string }[]> = {
  aluno: [
    { icone: Bus, texto: "Seu ônibus (prefixo) quando o prazo fecha, e se ele mudar" },
    { icone: MapPin, texto: "Quando o ônibus chega a cada ponto até o seu (avisa o primeiro aluno que embarca em cada ponto)" },
    { icone: Ban, texto: "Viagem cancelada, com ocorrência ou dia sem transporte" },
    { icone: ArrowDownLeft, texto: "Volta 20:30 liberada, confirmada ou cancelada" },
    { icone: GraduationCap, texto: "Matrícula vencendo ou vencida" },
  ],
  motorista: [
    { icone: UserCheck, texto: "Quando você é escalado ou sai de uma viagem de hoje ou amanhã" },
    { icone: ClipboardList, texto: "Quando a lista fecha, com quantos alunos vão no seu ônibus" },
    { icone: Ban, texto: "Viagem cancelada" },
  ],
};

export function TelaNotificacoes({ app, lembretes: lembretesInicial }: { app: QualApp; lembretes: boolean }) {
  const { estado, ocupado, ativar, desativar } = useNotificacoes();
  const [lembretes, setLembretes] = useState(lembretesInicial);
  const [testando, iniciarTeste] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const voltar = app === "motorista" ? "/app/motorista" : "/app";

  const status = {
    carregando: { icone: Loader2, titulo: "Verificando…", texto: "", cor: "from-slate-400 to-slate-500" },
    ativa: { icone: BellRing, titulo: "Ativadas neste celular", texto: "Os avisos do transporte chegam aqui, mesmo com o app fechado.", cor: "from-emerald-500 to-emerald-600" },
    pendente: { icone: BellOff, titulo: "Desativadas", texto: "Ative para receber os avisos na hora, mesmo com o app fechado.", cor: "from-azul-500 to-azul-700" },
    desligada: { icone: BellOff, titulo: "Desligadas neste celular", texto: "Você desligou. Os avisos continuam em Avisos, dentro do app.", cor: "from-slate-400 to-slate-500" },
    negada: {
      icone: BellOff,
      titulo: "Bloqueadas no navegador",
      texto: "Para liberar: toque no cadeado (ou ⋮) ao lado do endereço → Configurações do site → Notificações → Permitir. No app instalado: ajustes do celular → Apps → Transporte Italva → Notificações.",
      cor: "from-red-500 to-red-600",
    },
    precisa_instalar: {
      icone: Smartphone,
      titulo: "Instale o app primeiro",
      texto: "No iPhone e no iPad, as notificações só funcionam com o app instalado na tela de início (iOS 16.4 ou mais novo).",
      cor: "from-amber-500 to-amber-600",
    },
    indisponivel: {
      icone: BellOff,
      titulo: "Este navegador não recebe notificações",
      texto: "Abra o app no Chrome (Android) ou instale o app no iPhone para receber os avisos.",
      cor: "from-slate-400 to-slate-500",
    },
  }[estado];
  const Icone = status.icone;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <Link href={voltar} className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Avisos no celular</p>
          <p className="font-semibold text-slate-900">Notificações</p>
        </div>
      </div>

      <section className="flex flex-col items-center gap-3 rounded-3xl bg-white p-6 text-center shadow-suave">
        <span className={cx("flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", status.cor)}>
          <Icone className={cx("size-8", estado === "carregando" && "animate-spin")} />
        </span>
        <div>
          <p className="text-lg font-bold text-slate-900">{status.titulo}</p>
          {status.texto && <p className="mt-1 text-sm text-slate-600">{status.texto}</p>}
        </div>

        {(estado === "pendente" || estado === "desligada") && (
          <button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              const r = await ativar();
              if (r === "ativa") toast.success("Pronto! Toque em “Enviar teste” para ver como chega.");
              else if (r === "negada") toast.error("As notificações foram bloqueadas no navegador.");
              else toast.error("Não foi possível ativar agora. Tente de novo.");
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-azul-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />} Ativar notificações
          </button>
        )}
        {estado === "precisa_instalar" && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("abrir-instalar-app"))}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-azul-600 text-base font-semibold text-white active:scale-[0.98]"
          >
            <Smartphone className="size-5" /> Como instalar o app
          </button>
        )}
        {estado === "ativa" && (
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              disabled={testando}
              onClick={() =>
                iniciarTeste(async () => {
                  const r = await enviarTeste();
                  if (r.ok) toast.success("Teste enviado! Deve chegar em alguns segundos.");
                  else toast.error(r.erro);
                })
              }
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-azul-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
            >
              {testando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} Enviar teste
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                await desativar();
                toast("Notificações desligadas neste celular.");
              }}
              className="h-11 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              Desligar neste celular
            </button>
          </div>
        )}
      </section>

      {app === "aluno" && (
        <section className="rounded-3xl bg-white p-5 shadow-suave">
          <label className="flex cursor-pointer items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CalendarClock className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">Lembrete de reserva</span>
              <span className="block text-sm text-slate-500">1 hora antes do prazo, se você ainda não reservou a ida ou a volta do dia.</span>
            </span>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={lembretes}
              disabled={salvando}
              onChange={(e) => {
                const novo = e.target.checked;
                setLembretes(novo);
                iniciarSalvar(async () => {
                  const r = await alterarLembretes(novo);
                  if (!r.ok) {
                    setLembretes(!novo);
                    toast.error(r.erro);
                  }
                });
              }}
            />
            <span
              aria-hidden
              className="relative mt-1 h-7 w-12 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-azul-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-azul-400"
            />
          </label>
        </section>
      )}

      <section className="rounded-3xl bg-white p-5 shadow-suave">
        <p className="mb-3 font-semibold text-slate-900">O que chega no celular</p>
        <ul className="flex flex-col gap-3">
          {O_QUE_CHEGA[app].map(({ icone: I, texto }) => (
            <li key={texto} className="flex items-start gap-3 text-sm text-slate-600">
              <I className="mt-0.5 size-4 shrink-0 text-azul-600" />
              {texto}
            </li>
          ))}
        </ul>
        {app === "aluno" && (
          <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> Tudo também fica guardado em Avisos, dentro do app.
          </p>
        )}
      </section>
    </div>
  );
}
