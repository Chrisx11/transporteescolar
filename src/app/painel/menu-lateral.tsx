"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsLeft, X } from "lucide-react";
import { Marca, cx } from "@/components/ui";
import type { Perfil } from "@/lib/rotulos";
import { COOKIE_MENU, INICIO, MENU, type ItemMenu } from "./navegacao";

const FUNDO = "bg-gradient-to-b from-azul-900 via-azul-950 to-[#0d1340]";
const LARGURA = { aberto: 272, recolhido: 76 };

function ativo(caminho: string, href: string) {
  return href === "/painel" ? caminho === "/painel" : caminho === href || caminho.startsWith(href + "/");
}

function LinkMenu({ item, recolhido, aoNavegar }: { item: ItemMenu; recolhido: boolean; aoNavegar?: () => void }) {
  const caminho = usePathname();
  const eh = ativo(caminho, item.href);
  const Icone = item.icone;
  return (
    <Link
      href={item.href}
      onClick={aoNavegar}
      aria-current={eh ? "page" : undefined}
      aria-label={recolhido ? item.rotulo : undefined}
      className={cx(
        "group/item relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        recolhido && "justify-center px-0",
        eh ? "bg-white/10 text-white" : "text-azul-100/70 hover:bg-white/5 hover:text-white",
      )}
    >
      {eh && (
        <motion.span
          layoutId="indicador-menu"
          className="absolute inset-y-2 left-0 w-1 rounded-full bg-destaque-400"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <Icone className={cx("size-[18px] shrink-0", eh ? "text-destaque-400" : "text-azul-200/60 group-hover/item:text-azul-100")} />
      {!recolhido && <span className="truncate">{item.rotulo}</span>}
      {recolhido && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/item:opacity-100"
        >
          {item.rotulo}
        </span>
      )}
    </Link>
  );
}

function Navegacao({ perfil, recolhido, aoNavegar }: { perfil: Perfil; recolhido: boolean; aoNavegar?: () => void }) {
  const grupos = MENU.filter((g) => g.perfis.includes(perfil));
  return (
    // Recolhido, o menu fica visível por fora para as dicas (tooltips) não serem cortadas.
    <nav
      className={cx("flex-1 px-3 py-4", recolhido ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}
      aria-label="Menu principal"
    >
      <LinkMenu item={INICIO} recolhido={recolhido} aoNavegar={aoNavegar} />
      {grupos.map((g) => (
        <div key={g.titulo} className="mt-5">
          {recolhido ? (
            <div className="mx-auto mb-2 h-px w-8 bg-white/10" aria-hidden />
          ) : (
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-azul-200/40">{g.titulo}</p>
          )}
          <div className="flex flex-col gap-0.5">
            {g.itens.map((i) => (
              <LinkMenu key={i.href} item={i} recolhido={recolhido} aoNavegar={aoNavegar} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Logo({ recolhido }: { recolhido: boolean }) {
  return (
    <Link href="/painel" className={cx("flex h-16 shrink-0 items-center gap-3", recolhido ? "justify-center" : "px-5")}>
      <Marca className="size-9" />
      {!recolhido && (
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-azul-200/60">Prefeitura de Italva</p>
          <p className="truncate text-sm font-bold text-white">Transporte Universitário</p>
        </div>
      )}
    </Link>
  );
}

/** Abre/fecha a gaveta do menu no celular (o botão fica na barra superior). */
export const EVENTO_ABRIR_MENU = "abrir-menu-lateral";

/**
 * Menu lateral. No computador pode ser recolhido (só ícones) — a escolha fica
 * salva num cookie e o atalho é Ctrl+B. No celular vira uma gaveta deslizante.
 */
export function MenuLateral({ perfil, recolhidoInicial }: { perfil: Perfil; recolhidoInicial: boolean }) {
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const [gaveta, setGaveta] = useState(false);
  const caminho = usePathname();

  useEffect(() => setGaveta(false), [caminho]);

  const alternar = useCallback(() => {
    setRecolhido((r) => {
      document.cookie = `${COOKIE_MENU}=${r ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !r;
    });
  }, []);

  useEffect(() => {
    const teclado = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        alternar();
      }
      if (e.key === "Escape") setGaveta(false);
    };
    const abrir = () => setGaveta(true);
    window.addEventListener("keydown", teclado);
    window.addEventListener(EVENTO_ABRIR_MENU, abrir);
    return () => {
      window.removeEventListener("keydown", teclado);
      window.removeEventListener(EVENTO_ABRIR_MENU, abrir);
    };
  }, [alternar]);

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: recolhido ? LARGURA.recolhido : LARGURA.aberto }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className={cx("nao-imprimir sticky top-0 z-40 hidden h-dvh shrink-0 flex-col md:flex", FUNDO)}
      >
        <Logo recolhido={recolhido} />
        <Navegacao perfil={perfil} recolhido={recolhido} />
        <div className="border-t border-white/10 p-3">
          <button
            onClick={alternar}
            title={recolhido ? "Expandir menu (Ctrl+B)" : "Recolher menu (Ctrl+B)"}
            className={cx(
              "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-azul-100/70 transition-colors hover:bg-white/5 hover:text-white",
              recolhido && "justify-center px-0",
            )}
          >
            <ChevronsLeft className={cx("size-[18px] shrink-0 transition-transform duration-300", recolhido && "rotate-180")} />
            {!recolhido && (
              <>
                <span>Recolher menu</span>
                <kbd className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-azul-100/60">
                  Ctrl B
                </kbd>
              </>
            )}
          </button>
        </div>
      </motion.aside>

      <AnimatePresence>
        {gaveta && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGaveta(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className={cx("fixed inset-y-0 left-0 z-50 flex w-72 flex-col shadow-2xl md:hidden", FUNDO)}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              <div className="flex items-center justify-between pr-3">
                <Logo recolhido={false} />
                <button
                  onClick={() => setGaveta(false)}
                  className="flex size-9 items-center justify-center rounded-lg text-azul-100 hover:bg-white/10"
                  aria-label="Fechar menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              <Navegacao perfil={perfil} recolhido={false} aoNavegar={() => setGaveta(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
