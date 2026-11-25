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

// Leitura de QR na web. Usa o BarcodeDetector do aparelho quando existe (Android/Chrome);
// nos demais (iPhone/Safari) decodifica os quadros da câmera com a biblioteca jsQR.
// O aluno também pode ler com a câmera do próprio celular, que abre o link /embarque/<token>.
let fluxo: MediaStream | null = null;
const leitorWeb: LeitorQR = {
  async disponivel() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  },
  async ler(video) {
    type Detector = { detect(s: HTMLVideoElement): Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
    fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = fluxo;
    video.setAttribute("playsinline", "true");
    await video.play();

    let detector: Detector | null = null;
    if (Ctor) {
      try {
        detector = new Ctor({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }
    const jsQR = detector ? null : (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    while (fluxo) {
      let valor: string | null = null;
      if (detector) {
        const achados = await detector.detect(video).catch(() => []);
        valor = achados[0]?.rawValue ?? null;
      } else if (jsQR && ctx && video.videoWidth) {
        // Reduz o quadro para ler mais rápido em celulares simples.
        const escala = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * escala);
        canvas.height = Math.round(video.videoHeight * escala);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        valor = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
      }
      if (valor) {
        this.parar();
        return valor;
      }
      await new Promise((r) => setTimeout(r, 200));
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
