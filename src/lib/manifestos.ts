import type { MetadataRoute } from "next";

/**
 * Dois apps instaláveis, um para cada público. Cada um tem o próprio `id`
 * (o celular trata como apps diferentes) e abre direto na sua área.
 */
const ICONES: MetadataRoute.Manifest["icons"] = [
  { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const BASE = {
  lang: "pt-BR",
  dir: "ltr",
  scope: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait",
  background_color: "#f4f6fb",
  theme_color: "#1d3bd8",
  categories: ["education", "travel", "utilities"],
  prefer_related_applications: false,
  icons: ICONES,
} satisfies Partial<MetadataRoute.Manifest> & { display_override: string[] };

export const MANIFESTO = {
  aluno: {
    ...BASE,
    id: "/app",
    name: "Transporte Italva · Aluno",
    short_name: "Transporte Italva",
    description: "Reserve a ida e a volta do transporte universitário de Italva e embarque lendo o QR code do ônibus.",
    start_url: "/app?origem=app",
    shortcuts: [
      { name: "Ler QR code do ônibus", short_name: "Ler QR", url: "/app/ler-qr?origem=atalho", icons: [{ src: "/icones/icone-192.png", sizes: "192x192" }] },
      { name: "Minhas viagens de hoje", short_name: "Hoje", url: "/app?origem=atalho", icons: [{ src: "/icones/icone-192.png", sizes: "192x192" }] },
      { name: "Avisos", url: "/app/avisos?origem=atalho", icons: [{ src: "/icones/icone-192.png", sizes: "192x192" }] },
    ],
  },
  motorista: {
    ...BASE,
    id: "/app/motorista",
    name: "Transporte Italva · Motorista",
    short_name: "Motorista Italva",
    description: "Listas de embarque, presença e localização para os motoristas do transporte universitário de Italva.",
    start_url: "/app/motorista?origem=app",
    shortcuts: [{ name: "Minhas viagens", url: "/app/motorista?origem=atalho", icons: [{ src: "/icones/icone-192.png", sizes: "192x192" }] }],
  },
} as const;

export function respostaManifesto(qual: keyof typeof MANIFESTO) {
  return new Response(JSON.stringify(MANIFESTO[qual]), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
