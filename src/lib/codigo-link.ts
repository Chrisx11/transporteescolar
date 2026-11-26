import "server-only";
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

/** Endereço público do site (para montar o link). */
export function urlDoSite(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function linkCompletar(codigo: string): string {
  return `${urlDoSite()}/completar/${codigo}`;
}
