"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Bus,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Download,
  LogOut,
  Menu,
  BellRing,
  ScanLine,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, cx } from "@/components/ui";
import { useInstalacao } from "@/lib/instalacao";
import { esquecerInscricaoAoSair } from "@/lib/notificacoes-push";
import { PainelInstalar, type QualApp } from "./instalar-app";

type Item = { href: string; rotulo: string; icone: typeof Bell; exato?: boolean };

const ITENS: Record<QualApp, Item[]> = {
  aluno: [
    { href: "/app", rotulo: "Minhas viagens", icone: CalendarCheck, exato: true },
    { href: "/app/ler-qr", rotulo: "Ler QR code do ônibus", icone: ScanLine },
    { href: "/app/avisos", rotulo: "Avisos", icone: Bell },
    { href: "/app/meus-dados", rotulo: "Meus dados", icone: UserRound },
    { href: "/app/notificacoes", rotulo: "Notificações", icone: BellRing },
  ],
  motorista: [
    { href: "/app/motorista", rotulo: "Minhas viagens", icone: Bus },
    { href: "/app/notificacoes", rotulo: "Notificações", icone: BellRing },
  ],
};

/**
 * Menu do app do aluno e do motorista: gaveta lateral com as telas,
 * "Baixar o app" (instalação no celular) e Sair.
 */
export function MenuApp({ app, nome, perfil, naoLidos }: { app: QualApp; nome: string; perfil: string; naoLidos: number }) {
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<"menu" | "instalar">("menu");
  const caminho = usePathname();
  const { plataforma, instalar } = useInstalacao();
  const instalado = plataforma === "instalado";

  /** Onde o navegador permite (Android, computador), já abre a janela de instalação; senão, o passo a passo. */
  async function baixar() {
    if (plataforma === "pronto") {
      const ok = await instalar();
      if (ok) {
        toast.success("App instalado! Procure o ícone na tela do seu celular.");
        setAberto(false);
      }
      return;
    }
    setTela("instalar");
  }
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  function abrir(qual: "menu" | "instalar" = "menu") {
    setTela(qual);
    setAberto(true);
  }

  // Fecha ao trocar de página.
  useEffect(() => setAberto(false), [caminho]);

  // Outros pontos do app (ex.: o convite na tela inicial) abrem direto o "Baixar o app".
  useEffect(() => {
    const abrirInstalar = () => {
      if (window.__eventoInstalar) return; // o convite já abriu a instalação direto
      abrir("instalar");
    };
    window.addEventListener("abrir-instalar-app", abrirInstalar);
    return () => window.removeEventListener("abrir-instalar-app", abrirInstalar);
  }, []);

  // Esc fecha, a página de trás não rola e o foco vai para a gaveta (e volta ao botão ao fechar).
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();
    const voltarFoco = botao.current;
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
      voltarFoco?.focus();
    };
  }, [aberto]);

  const ativo = (i: Item) => (i.exato ? caminho === i.href : caminho.startsWith(i.href));

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => abrir()}
        className="relative flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
        aria-label="Abrir menu"
        aria-expanded={aberto}
      >
        <Menu className="size-5" />
        {!instalado && plataforma !== null && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-destaque-400 ring-2 ring-azul-700" aria-hidden />
        )}
      </button>

      <div
        className={cx("fixed inset-0 z-50 transition-[visibility] duration-300", aberto ? "visible" : "invisible delay-150")}
        aria-hidden={!aberto}
      >
        <div
          className={cx("absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-300", aberto ? "opacity-100" : "opacity-0")}
          onClick={() => setAberto(false)}
        />
        <div
          ref={painel}
          role="dialog"
          aria-modal="true"
          aria-label={tela === "menu" ? "Menu" : "Baixar o app"}
          tabIndex={-1}
          className={cx(
            "absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col bg-white shadow-2xl outline-none transition-transform duration-300 ease-out",
            "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]",
            aberto ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            {tela === "instalar" ? (
              <button
                type="button"
                onClick={() => setTela("menu")}
                className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                aria-label="Voltar ao menu"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : (
              <Avatar nome={nome} className="size-10 text-xs" />
            )}
            <div className="min-w-0 flex-1">
              {tela === "instalar" ? (
                <p className="font-semibold text-slate-900">Baixar o app</p>
              ) : (
                <>
                  <p className="truncate font-semibold text-slate-900">{nome}</p>
                  <p className="text-xs text-slate-500">{perfil}</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              aria-label="Fechar menu"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            {tela === "instalar" ? (
              <PainelInstalar app={app} />
            ) : (
              <div className="flex flex-col gap-4">
                <nav className="flex flex-col gap-1">
                  {ITENS[app].map((i) => (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={() => setAberto(false)}
                      className={cx(
                        "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                        ativo(i) ? "bg-azul-50 text-azul-800" : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <i.icone className={cx("size-5", ativo(i) ? "text-azul-600" : "text-slate-400")} />
                      <span className="flex-1">{i.rotulo}</span>
                      {i.href === "/app/avisos" && naoLidos > 0 && (
                        <span className="rounded-full bg-destaque-400 px-2 text-xs font-bold text-azul-950">{naoLidos}</span>
                      )}
                    </Link>
                  ))}
                </nav>

                {instalado ? (
                  <p className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
                    <CheckCircle2 className="size-5 shrink-0" /> Você está usando o app instalado.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void baixar()}
                    className="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-azul-600 to-azul-800 p-4 text-left text-white shadow-lg shadow-azul-600/25 transition active:scale-[0.98]"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                      <Download className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">Baixar o app</span>
                      <span className="block text-xs text-azul-100">Tenha o transporte na tela do seu celular</span>
                    </span>
                    <ChevronRight className="size-5 text-azul-200 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {tela === "menu" && (
            <div className="border-t border-slate-100 p-4">
              <form
                action="/auth/sair"
                method="post"
                onSubmit={async (e) => {
                  // Antes de sair, o celular para de receber os avisos desta conta.
                  e.preventDefault();
                  const form = e.currentTarget;
                  await esquecerInscricaoAoSair();
                  form.submit();
                }}
              >
                <button className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-red-600 hover:bg-red-50">
                  <LogOut className="size-5" /> Sair
                </button>
              </form>
              <p className="mt-2 px-3 text-xs text-slate-400">Prefeitura de Italva · Transporte Universitário</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Convite discreto na tela inicial para instalar o app (some se instalado ou se o usuário dispensar). */
export function ConviteInstalar({ app }: { app: QualApp }) {
  const { plataforma, instalar } = useInstalacao();
  const chave = `convite-instalar-${app}`;
  const [dispensado, setDispensado] = useState(true);
  useEffect(() => {
    try {
      const ate = Number(localStorage.getItem(chave) ?? 0);
      setDispensado(Date.now() < ate);
    } catch {
      setDispensado(false);
    }
  }, [chave]);

  if (dispensado || plataforma === null || plataforma === "instalado") return null;

  function dispensar() {
    setDispensado(true);
    try {
      localStorage.setItem(chave, String(Date.now() + 14 * 86_400_000)); // volta em 14 dias
    } catch {}
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 pr-2 shadow-suave ring-1 ring-azul-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icones/icone-192.png" alt="" className="size-11 shrink-0 rounded-[22%]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">Instale o app no celular</p>
        <p className="text-xs text-slate-500">Abre mais rápido, direto na sua tela.</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          // Android/computador: abre a instalação do navegador na hora. iPhone e outros: o passo a passo.
          if (plataforma === "pronto") {
            if (await instalar()) toast.success("App instalado! Procure o ícone na tela do seu celular.");
          } else window.dispatchEvent(new Event("abrir-instalar-app"));
        }}
        className="h-9 shrink-0 rounded-xl bg-azul-600 px-3 text-sm font-semibold text-white active:scale-95"
      >
        Baixar
      </button>
      <button type="button" onClick={dispensar} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50" aria-label="Agora não">
        <X className="size-4" />
      </button>
    </div>
  );
}
