// Service worker básico do PWA.
// Fase 1: cache dos arquivos estáticos e página "sem conexão".
// Fase 3: as telas do motorista ficam guardadas para abrir sem sinal (a lista e a
// fila de presenças ficam no armazenamento do celular, pela própria tela).
const VERSAO = "v2";
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
