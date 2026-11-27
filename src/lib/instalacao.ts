"use client";

import { useEffect, useState } from "react";

/**
 * Instalação do app (PWA) no celular ou computador.
 *
 * O evento `beforeinstallprompt` (Chrome, Edge, Samsung Internet) dispara uma
 * vez, logo que a página carrega; um script no <head> (lib/instalacao-script.ts) o guarda
 * em `window.__eventoInstalar` antes mesmo do React carregar. Safari (iPhone/iPad)
 * e Firefox não têm esse evento: nesses casos mostramos o passo a passo.
 */

type EventoInstalar = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __eventoInstalar?: EventoInstalar | null;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

export type Plataforma =
  | "instalado" // já está aberto como app
  | "pronto" // o navegador oferece o botão Instalar (Android/Chrome/Edge/computador)
  | "ios-safari" // iPhone/iPad no Safari: Compartilhar → Adicionar à Tela de Início
  | "ios-outro" // iPhone/iPad em Chrome/Firefox/Edge: o mesmo pelo botão compartilhar
  | "navegador-interno" // aberto dentro do WhatsApp/Instagram/Facebook: precisa abrir no navegador
  | "android-manual" // Android sem o evento (Firefox, ou já recusou): menu ⋮ → Instalar
  | "computador-manual"; // computador sem o evento (Firefox/Safari): orientações

export function detectarPlataforma(): Plataforma {
  if (typeof window === "undefined") return "computador-manual";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone === true;
  if (standalone) return "instalado";
  const ua = navigator.userAgent;
  // iPadOS se apresenta como Mac; a tela de toque denuncia.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const interno = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|TikTok|; wv\)/i.test(ua);
  if (interno) return "navegador-interno";
  if (window.__eventoInstalar) return "pronto";
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-outro" : "ios-safari";
  if (/Android/i.test(ua)) return "android-manual";
  return "computador-manual";
}

/** Estado da instalação, atualizado quando o navegador libera o botão ou o app é instalado. */
export function useInstalacao() {
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  useEffect(() => {
    const atualizar = () => setPlataforma(detectarPlataforma());
    atualizar();
    window.addEventListener("instalacao-mudou", atualizar);
    const modo = window.matchMedia("(display-mode: standalone)");
    modo.addEventListener?.("change", atualizar);
    return () => {
      window.removeEventListener("instalacao-mudou", atualizar);
      modo.removeEventListener?.("change", atualizar);
    };
  }, []);

  /** Abre a janela de instalação do navegador. Retorna true se o usuário aceitou. */
  async function instalar(): Promise<boolean> {
    const evento = window.__eventoInstalar;
    if (!evento) return false;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // O evento só pode ser usado uma vez.
    window.__eventoInstalar = null;
    setPlataforma(detectarPlataforma());
    return outcome === "accepted";
  }

  return { plataforma, instalar };
}
