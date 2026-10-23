"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { Botao } from "@/components/ui";

/**
 * Janela de confirmação (substitui o window.confirm do navegador).
 * Uso: const [janela, pedir] = useConfirmacao(); if (await pedir("Excluir?")) ...
 */
export function useConfirmacao() {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const pedir = useCallback((texto: string) => {
    setMensagem(texto);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setMensagem(null);
  }, []);

  const janela = <JanelaConfirmacao mensagem={mensagem} aoResponder={responder} />;
  return [janela, pedir] as const;
}

function JanelaConfirmacao({ mensagem, aoResponder }: { mensagem: string | null; aoResponder: (ok: boolean) => void }) {
  const confirmar = useRef<HTMLButtonElement>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!mensagem) return;
    confirmar.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoResponder(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [mensagem, aoResponder]);

  if (!montado) return null;
  return createPortal(
    <AnimatePresence>
      {mensagem && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
          <motion.div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => aoResponder(false)}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmacao"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
          >
            <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-8 ring-amber-50/50">
              <AlertTriangle className="size-6" />
            </span>
            <h2 id="titulo-confirmacao" className="text-lg font-semibold text-slate-900">
              Confirmar ação
            </h2>
            <p className="mt-1 text-sm text-slate-600">{mensagem}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Botao type="button" variante="secundario" onClick={() => aoResponder(false)}>
                Cancelar
              </Botao>
              <Botao ref={confirmar} type="button" onClick={() => aoResponder(true)}>
                Confirmar
              </Botao>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
