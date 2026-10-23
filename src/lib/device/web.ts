"use client";

import type { Dispositivo, LeitorQR, Localizacao, Notificacoes, PermissaoNotificacao, Posicao } from "./index";

function paraPosicao(p: GeolocationPosition): Posicao {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    precisao: p.coords.accuracy,
    em: new Date(p.timestamp),
  };
}

function erroGeo(e: GeolocationPositionError): Error {
  if (e.code === e.PERMISSION_DENIED) return new Error("Permita o acesso à localização nas configurações do celular.");
  if (e.code === e.TIMEOUT) return new Error("Não foi possível obter a localização. Tente de novo.");
  return new Error("Localização indisponível no momento.");
}

const localizacaoWeb: Localizacao = {
  posicaoAtual() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Este aparelho não informa a localização."));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(paraPosicao(p)),
        (e) => reject(erroGeo(e)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  },
  acompanhar(aoMudar, aoErrar) {
    if (!("geolocation" in navigator)) {
      aoErrar?.(new Error("Este aparelho não informa a localização."));
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      (p) => aoMudar(paraPosicao(p)),
      (e) => aoErrar?.(erroGeo(e)),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  },
};

// Leitura de QR na web (implementação completa na Fase 3). Usa o BarcodeDetector
// quando existe; nos demais aparelhos o aluno lê com a câmera do próprio celular,
// que abre o link /embarque/<token> no app.
let fluxo: MediaStream | null = null;
const leitorWeb: LeitorQR = {
  async disponivel() {
    return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices;
  },
  async ler(video) {
    type Detector = { detect(s: HTMLVideoElement): Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
    if (!Ctor) return null;
    fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = fluxo;
    await video.play();
    const detector = new Ctor({ formats: ["qr_code"] });
    while (fluxo) {
      const achados = await detector.detect(video).catch(() => []);
      if (achados.length) {
        const valor = achados[0].rawValue;
        this.parar();
        return valor;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  },
  parar() {
    fluxo?.getTracks().forEach((t) => t.stop());
    fluxo = null;
  },
};

function traduzir(p: NotificationPermission): PermissaoNotificacao {
  return p === "granted" ? "concedida" : p === "denied" ? "negada" : "pendente";
}

const notificacoesWeb: Notificacoes = {
  async permissao() {
    if (!("Notification" in window)) return "indisponivel";
    return traduzir(Notification.permission);
  },
  async pedirPermissao() {
    if (!("Notification" in window)) return "indisponivel";
    return traduzir(await Notification.requestPermission());
  },
  async inscrever(chavePublicaVapid) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    const chave = Uint8Array.from(atob(chavePublicaVapid.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    return sub.toJSON();
  },
};

const dispositivoWeb: Dispositivo = {
  localizacao: localizacaoWeb,
  leitorQR: leitorWeb,
  notificacoes: notificacoesWeb,
};

export function obterDispositivo(): Dispositivo {
  return dispositivoWeb;
}
