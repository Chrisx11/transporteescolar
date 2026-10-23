import type { Cidade } from "@/lib/rotulos";

export type StatusViagem = "agendada" | "prazo_fechado" | "em_andamento" | "encerrada" | "cancelada" | "com_ocorrencia";

/** Linha devolvida pela função minhas_viagens(data) do banco. */
export type MinhaViagem = {
  sentido: "ida" | "volta";
  viagem_dia_id: string | null;
  nome: string;
  cidade: Cidade;
  saida_em: string;
  abertura_em: string | null;
  prazo_em: string | null;
  status_viagem: StatusViagem | null;
  reserva_id: string | null;
  onibus_prefixo: string | null;
  ponto_nome: string | null;
  motivo: string | null;
  mensagem: string | null;
  pode_cancelar: boolean;
};

export const STATUS_VIAGEM: Record<StatusViagem, { rotulo: string; cor: "azul" | "amarelo" | "verde" | "cinza" | "vermelho" }> = {
  agendada: { rotulo: "Reservas abertas", cor: "azul" },
  prazo_fechado: { rotulo: "Prazo encerrado", cor: "amarelo" },
  em_andamento: { rotulo: "Em andamento", cor: "verde" },
  encerrada: { rotulo: "Encerrada", cor: "cinza" },
  cancelada: { rotulo: "Cancelada", cor: "vermelho" },
  com_ocorrencia: { rotulo: "Com ocorrência", cor: "vermelho" },
};

/** "2h 10min", "35min", "menos de 1 min" */
export function tempoRestante(ms: number): string {
  if (ms <= 60_000) return "menos de 1 min";
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${String(min % 60).padStart(2, "0")}min`;
  return `${min}min`;
}
