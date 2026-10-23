import { hojeSP, somarDias } from "@/lib/tempo";

export type EstadoValidade = "vencido" | "vencendo" | "ok" | "sem_data";

/** Situação de uma data de validade (CNH, vistoria, licenciamento, matrícula). */
export function estadoValidade(data: string | null | undefined, diasAviso = 30): EstadoValidade {
  if (!data) return "sem_data";
  const hoje = hojeSP();
  if (data < hoje) return "vencido";
  if (data <= somarDias(hoje, diasAviso)) return "vencendo";
  return "ok";
}

export const COR_VALIDADE = {
  vencido: "vermelho",
  vencendo: "amarelo",
  ok: "verde",
  sem_data: "cinza",
} as const;
