"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, House, KeyRound, LogOut, Menu } from "lucide-react";
import { Avatar, Marca, cx } from "@/components/ui";
import { trilha } from "./navegacao";
import { EVENTO_ABRIR_MENU } from "./menu-lateral";

type Usuario = { nome: string; perfilRotulo: string; cpf: string; email: string | null };

function MenuUsuario({ usuario }: { usuario: Usuario }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="flex items-center gap-2.5 rounded-xl p-1 pr-2 transition-colors hover:bg-slate-100"
      >
        <Avatar nome={usuario.nome} className="size-8" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-semibold text-slate-900">{usuario.nome}</span>
          <span className="block text-xs text-slate-500">{usuario.perfilRotulo}</span>
        </span>
        <ChevronDown className={cx("hidden size-4 text-slate-400 transition-transform sm:block", aberto && "rotate-180")} />
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elevada"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 p-4">
              <Avatar nome={usuario.nome} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{usuario.nome}</p>
                <p className="truncate text-xs text-slate-500">{usuario.email ?? `CPF ${usuario.cpf}`}</p>
              </div>
            </div>
            <div className="p-1.5">
              <Link
                href="/trocar-senha"
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <KeyRound className="size-4 text-slate-400" /> Trocar senha
              </Link>
              <form action="/auth/sair" method="post">
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="size-4" /> Sair
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Barra do topo do painel: trilha de navegação e menu do usuário. */
export function BarraSuperior({ usuario }: { usuario: Usuario }) {
  const caminho = usePathname();
  const partes = trilha(caminho);

  return (
    <header className="nao-imprimir sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
      <button
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_MENU))}
        className="-ml-1 flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-5" />
      </button>
      <Marca className="size-8 md:hidden" />

      <nav aria-label="Trilha" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        {partes.map((p, i) => {
          const ultimo = i === partes.length - 1;
          return (
            <Fragment key={p.href}>
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-slate-300" />}
              {ultimo ? (
                <span className="truncate font-semibold text-slate-900">{p.rotulo}</span>
              ) : (
                <Link href={p.href} className="flex items-center gap-1.5 truncate text-slate-500 transition-colors hover:text-slate-900">
                  {i === 0 && <House className="size-3.5" />}
                  {p.rotulo}
                </Link>
              )}
            </Fragment>
          );
        })}
      </nav>
      <span className="truncate text-sm font-semibold text-slate-900 md:hidden">{partes[partes.length - 1]?.rotulo}</span>

      <div className="ml-auto">
        <MenuUsuario usuario={usuario} />
      </div>
    </header>
  );
}
