import "server-only";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

/** Dias de validade do link individual para completar o pedido de passe. */
export const DIAS_VALIDADE_LINK = 30;

/** Resumo (sha256) do código: é o que fica no banco; o código só vai no link. */
export function resumoCodigo(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

/** Novo código secreto (impossível de adivinhar) e a data em que expira. */
export function novoCodigo() {
  const codigo = randomBytes(24).toString("base64url");
  return {
    codigo,
    hash: resumoCodigo(codigo),
    expiraEm: new Date(Date.now() + DIAS_VALIDADE_LINK * 864e5).toISOString(),
  };
}

/**
 * Endereço público do site: o mesmo pelo qual a pessoa está usando o painel
 * (assim o link nunca sai com um endereço que não é o do site).
 * NEXT_PUBLIC_APP_URL só é usado quando não há requisição (ex.: scripts).
 */
export async function urlDoSite(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  } catch {
    // fora de uma requisição
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function linkCompletar(codigo: string): Promise<string> {
  return `${await urlDoSite()}/completar/${codigo}`;
}
