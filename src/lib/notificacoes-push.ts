"use client";

import { useCallback, useEffect, useState } from "react";
import { obterDispositivo } from "@/lib/device";
import { chavePublicaPush, removerInscricao, salvarInscricao } from "@/app/app/notificacoes/acoes";

/**
 * Estado das notificações neste celular:
 *  - "ativa": permitido e inscrito (recebe);
 *  - "pendente": ainda não perguntou;
 *  - "desligada": a pessoa desligou neste celular (tela Notificações);
 *  - "negada": a pessoa bloqueou (só destrava nos ajustes do celular);
 *  - "precisa_instalar": iPhone/iPad fora do app instalado (lá só funciona instalado);
 *  - "indisponivel": navegador sem suporte.
 */
export type EstadoNotificacoes = "carregando" | "ativa" | "pendente" | "desligada" | "negada" | "precisa_instalar" | "indisponivel";

/** A pessoa desligou neste celular: não religa sozinho ao abrir o app. */
const CHAVE_DESLIGADA = "notificacoes-desligadas";
function marcarDesligada(sim: boolean) {
  try {
    if (sim) localStorage.setItem(CHAVE_DESLIGADA, "1");
    else localStorage.removeItem(CHAVE_DESLIGADA);
  } catch {}
}
function estaDesligada() {
  try {
    return localStorage.getItem(CHAVE_DESLIGADA) === "1";
  } catch {
    return false;
  }
}

function ehIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}
function instalado() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
function nomeAparelho() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  const android = ua.match(/Android[^;]*;\s*([^;)]+)/);
  if (android) return `Android · ${android[1].trim()}`;
  if (/Windows/.test(ua)) return "Computador (Windows)";
  if (/Mac/.test(ua)) return "Computador (Mac)";
  return "Navegador";
}

/** Service worker pronto (no desenvolvimento ele não é registrado sozinho). */
async function registro(): Promise<ServiceWorkerRegistration> {
  const atual = await navigator.serviceWorker.getRegistration();
  if (!atual) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function inscreverESalvar(): Promise<boolean> {
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const chave = await chavePublicaPush();
    const json = await obterDispositivo().notificacoes.inscrever(chave);
    if (!json) return false;
    sub = await reg.pushManager.getSubscription();
  }
  if (!sub) return false;
  const r = await salvarInscricao(sub.toJSON(), nomeAparelho());
  return r.ok;
}

let verificacao: Promise<EstadoNotificacoes> | null = null;

async function verificar(): Promise<EstadoNotificacoes> {
  const suporta = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  if (ehIOS() && !instalado()) return "precisa_instalar";
  if (!suporta) return "indisponivel";
  const p = Notification.permission;
  if (p === "denied") return "negada";
  if (p === "default") return "pendente";
  if (estaDesligada()) return "desligada";
  // Já permitido: garante a inscrição deste login (sem perguntar de novo).
  return (await inscreverESalvar().catch(() => false)) ? "ativa" : "pendente";
}

export function useNotificacoes() {
  const [estado, setEstado] = useState<EstadoNotificacoes>("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Uma verificação por abertura do app, mesmo com a janela e o cartão na tela.
    verificacao ??= verificar();
    verificacao.then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);

  /** Pede a permissão (precisa vir de um toque) e inscreve o celular. */
  const ativar = useCallback(async (): Promise<EstadoNotificacoes> => {
    setOcupado(true);
    try {
      marcarDesligada(false);
      const p = await obterDispositivo().notificacoes.pedirPermissao();
      const novo: EstadoNotificacoes =
        p === "negada" ? "negada" : p !== "concedida" ? "pendente" : (await inscreverESalvar()) ? "ativa" : "pendente";
      setEstado(novo);
      verificacao = Promise.resolve(novo);
      return novo;
    } catch {
      setEstado("pendente");
      return "pendente";
    } finally {
      setOcupado(false);
    }
  }, []);

  /** Este celular deixa de receber (a permissão do navegador continua). */
  const desativar = useCallback(async () => {
    setOcupado(true);
    try {
      const sub = await (await registro()).pushManager.getSubscription();
      if (sub) {
        await removerInscricao(sub.endpoint);
        await sub.unsubscribe();
      }
      marcarDesligada(true);
      setEstado("desligada");
      verificacao = Promise.resolve("desligada");
    } finally {
      setOcupado(false);
    }
  }, []);

  return { estado, ocupado, ativar, desativar };
}

/** Ao sair da conta: o celular para de receber os avisos dela. */
export async function esquecerInscricaoAoSair() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await Promise.race([removerInscricao(sub.endpoint), new Promise((ok) => setTimeout(ok, 1500))]);
    await sub.unsubscribe();
  } catch {
    // Sair nunca pode travar por causa disto.
  }
}
