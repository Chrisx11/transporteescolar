// Service worker básico do PWA.
// Fase 1: cache dos arquivos estáticos e página "sem conexão".
// Fase 3: as telas do motorista ficam guardadas para abrir sem sinal (a lista e a
// fila de presenças ficam no armazenamento do celular, pela própria tela).
// Fase 5: notificações no celular (push) e o toque que abre a tela certa.
const VERSAO = "v3";
const CACHE = `transporte-italva-${VERSAO}`;
const OFFLINE = "/offline";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE, "/icones/icone-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Telas do motorista: rede primeiro, guardando uma cópia; sem rede, abre a cópia.
  if (req.mode === "navigate" && url.pathname.startsWith("/app/motorista")) {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match(OFFLINE))),
    );
    return;
  }

  // Demais navegações: sempre da rede (dados sempre atuais); sem rede, página offline.
  if (req.mode === "navigate") {
    evento.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Arquivos estáticos versionados do Next e ícones: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icones/")) {
    evento.respondWith(
      caches.match(req).then(
        (cacheado) =>
          cacheado ||
          fetch(req).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return resp;
          }),
      ),
    );
  }
});

// ---------------------------------------------------------------------
// Notificações (Fase 5). O servidor manda { titulo, corpo, url, tag }.
// A mesma tag substitui a anterior (ex.: "ônibus no ponto" da mesma viagem).
// ---------------------------------------------------------------------
self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : "" };
  }
  const titulo = dados.titulo || "Transporte Italva";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-192.png",
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      vibrate: [200, 100, 200],
      data: { url: dados.url || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL((evento.notification.data && evento.notification.data.url) || "/app", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // Já tem o app aberto: traz para a frente e vai para a tela do aviso.
      for (const j of janelas) {
        if (new URL(j.url).origin === self.location.origin && "focus" in j) {
          return j.focus().then((f) => (f && "navigate" in f ? f.navigate(destino) : f));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});

// O navegador trocou a inscrição sozinho: a próxima abertura do app grava a nova.
self.addEventListener("pushsubscriptionchange", () => {});
