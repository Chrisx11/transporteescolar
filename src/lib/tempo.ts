/**
 * Datas e horários do sistema. Toda regra de prazo usa America/Sao_Paulo,
 * nunca o fuso do servidor.
 */
export const FUSO = "America/Sao_Paulo";

export type PrazoTipo = "dia_anterior" | "mesmo_dia";

/** Diferença (ms) entre o horário local do fuso e UTC num instante. */
function deslocamentoFuso(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const comoUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return comoUtc - instante.getTime();
}

/** Converte data (AAAA-MM-DD) + hora (HH:MM) de São Paulo para um instante absoluto. */
export function instanteSP(data: string, hora: string): Date {
  const [a, m, d] = data.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const palpite = Date.UTC(a, m - 1, d, h, min);
  const desloc = deslocamentoFuso(new Date(palpite), FUSO);
  return new Date(palpite - desloc);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Prazo de reserva/cancelamento (RN03/RN04). Igual à função SQL calcular_prazo. */
export function calcularPrazo(dataViagem: string, tipo: PrazoTipo, hora: string): Date {
  const dia = tipo === "dia_anterior" ? somarDias(dataViagem, -1) : dataViagem;
  return instanteSP(dia, hora);
}

/** Data de hoje em São Paulo (AAAA-MM-DD). */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

/** Dia da semana ISO (1 = segunda ... 7 = domingo) de uma data AAAA-MM-DD. */
export function diaSemanaIso(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export const DIAS_SEMANA: { valor: number; nome: string; curto: string }[] = [
  { valor: 1, nome: "Segunda-feira", curto: "Seg" },
  { valor: 2, nome: "Terça-feira", curto: "Ter" },
  { valor: 3, nome: "Quarta-feira", curto: "Qua" },
  { valor: 4, nome: "Quinta-feira", curto: "Qui" },
  { valor: 5, nome: "Sexta-feira", curto: "Sex" },
  { valor: 6, nome: "Sábado", curto: "Sáb" },
  { valor: 7, nome: "Domingo", curto: "Dom" },
];

/** "05:30:00" → "05:30" */
export function hhmm(hora: string | null | undefined): string {
  return hora ? hora.slice(0, 5) : "";
}

/** "2026-10-23" → "23/10/2026" */
export function dataBR(data: string | null | undefined): string {
  if (!data) return "";
  const [a, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Instante → "23/10/2026 19:00" no fuso de São Paulo. */
export function dataHoraBR(instante: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(instante));
}
