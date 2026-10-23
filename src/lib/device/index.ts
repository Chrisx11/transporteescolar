/**
 * Camada de recursos do aparelho (câmera, localização, notificações).
 *
 * As telas usam SOMENTE estas interfaces. Hoje a implementação é web
 * (navegador/PWA). Quando o app for empacotado com Capacitor, basta criar
 * implementações nativas e trocá-las em `obterDispositivo()`, sem mexer nas telas.
 */

export type Posicao = { lat: number; lng: number; precisao: number; em: Date };

export interface Localizacao {
  /** Lê a posição atual uma única vez (aluno, ao ler o QR). */
  posicaoAtual(): Promise<Posicao>;
  /** Acompanha a posição (motorista, durante a viagem). Retorna função para parar. */
  acompanhar(aoMudar: (p: Posicao) => void, aoErrar?: (e: Error) => void): () => void;
}

export interface LeitorQR {
  /** O aparelho consegue ler QR pela câmera dentro do app? */
  disponivel(): Promise<boolean>;
  /** Abre a câmera e resolve com o texto do QR lido (ou null se cancelado). */
  ler(video: HTMLVideoElement): Promise<string | null>;
  parar(): void;
}

export type PermissaoNotificacao = "concedida" | "negada" | "pendente" | "indisponivel";

export interface Notificacoes {
  permissao(): Promise<PermissaoNotificacao>;
  pedirPermissao(): Promise<PermissaoNotificacao>;
  /** Inscrição de push para enviar ao servidor (Fase 5). */
  inscrever(chavePublicaVapid: string): Promise<PushSubscriptionJSON | null>;
}

export interface Dispositivo {
  localizacao: Localizacao;
  leitorQR: LeitorQR;
  notificacoes: Notificacoes;
}

export { obterDispositivo } from "./web";
