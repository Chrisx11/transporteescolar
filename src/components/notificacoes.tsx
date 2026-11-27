"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { useNotificacoes, type EstadoNotificacoes } from "@/lib/notificacoes-push";
import type { QualApp } from "./instalar-app";

const TEXTO: Record<QualApp, string> = {
  aluno: "Saiba na hora qual é o seu ônibus, quando ele chegar ao seu ponto e se a viagem mudar.",
  motorista: "Saiba quando for escalado, quando a lista fechar e se a viagem for cancelada.",
};

function lerAte(chave: string) {
  try {
    return Date.now() < Number(localStorage.getItem(chave) ?? 0);
  } catch {
    return false;
  }
}
function adiar(chave: string, dias: number) {
  try {
    localStorage.setItem(chave, String(Date.now() + dias * 86_400_000));
  } catch {}
}

function avisarResultado(r: EstadoNotificacoes) {
  if (r === "ativa") toast.success("Pronto! Os avisos do transporte vão chegar neste celular.");
  else if (r === "negada") toast.error("As notificações foram bloqueadas. Dá para liberar nos ajustes do navegador.");
  else toast.error("Não foi possível ativar agora. Tente de novo.");
}

/**
 * Janela que pergunta sobre as notificações no primeiro acesso (e de novo 3 dias
 * depois de "Agora não"). O celular só deixa pedir a permissão depois de um toque.
 */
export function JanelaNotificacoes({ app }: { app: QualApp }) {
  const { estado, ocupado, ativar } = useNotificacoes();
  const chave = `janela-notificacoes-${app}`;
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (estado === "pendente" && !lerAte(chave)) {
      const t = setTimeout(() => setAberta(true), 800);
      return () => clearTimeout(t);
    }
  }, [estado, chave]);

  if (!aberta) return null;

  function fechar() {
    adiar(chave, 3);
    setAberta(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm animate-surgir rounded-3xl bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-azul-500 to-azul-700 text-white shadow-lg">
          <BellRing className="size-8" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-slate-900">Receber avisos no celular?</h2>
        <p className="mt-1.5 text-sm text-slate-600">{TEXTO[app]}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              const r = await ativar();
              avisarResultado(r);
              if (r !== "pendente") fechar();
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-azul-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />} Ativar notificações
          </button>
          <button type="button" onClick={fechar} className="h-11 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50">
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

/** Cartão na tela inicial enquanto as notificações não estão ativas neste celular. */
export function CartaoNotificacoes({ app }: { app: QualApp }) {
  const { estado, ocupado, ativar } = useNotificacoes();
  const chave = `cartao-notificacoes-${app}`;
  const [dispensado, setDispensado] = useState(true);
  useEffect(() => setDispensado(lerAte(chave)), [chave]);

  if (dispensado || !["pendente", "negada", "precisa_instalar"].includes(estado)) return null;

  const fechar = () => {
    adiar(chave, estado === "pendente" ? 2 : 14);
    setDispensado(true);
  };

  const conteudo =
    estado === "pendente"
      ? { icone: BellRing, titulo: "Ative as notificações", texto: TEXTO[app], cor: "bg-azul-50 text-azul-600" }
      : estado === "precisa_instalar"
        ? {
            icone: Smartphone,
            titulo: "Instale o app para receber avisos",
            texto: "No iPhone, as notificações só chegam com o app instalado na tela de início.",
            cor: "bg-amber-50 text-amber-600",
          }
        : {
            icone: BellOff,
            titulo: "Notificações bloqueadas",
            texto: "Para receber os avisos, libere nos ajustes: toque no cadeado ao lado do endereço → Notificações → Permitir.",
            cor: "bg-red-50 text-red-600",
          };
  const Icone = conteudo.icone;

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-3 pr-2 shadow-suave ring-1 ring-azul-100">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${conteudo.cor}`}>
        <Icone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{conteudo.titulo}</p>
        <p className="text-xs text-slate-500">{conteudo.texto}</p>
        {estado !== "negada" && (
          <button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              if (estado === "precisa_instalar") return window.dispatchEvent(new Event("abrir-instalar-app"));
              avisarResultado(await ativar());
            }}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl bg-azul-600 px-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {ocupado && <Loader2 className="size-4 animate-spin" />}
            {estado === "precisa_instalar" ? "Como instalar" : "Ativar"}
          </button>
        )}
      </div>
      <button type="button" onClick={fechar} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50" aria-label="Agora não">
        <X className="size-4" />
      </button>
    </div>
  );
}
