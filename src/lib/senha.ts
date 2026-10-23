import { randomInt } from "node:crypto";

// Sem letras/números parecidos (0/O, 1/l/I) para facilitar a digitação.
const LETRAS = "abcdefghjkmnpqrstuvwxyz";
const NUMEROS = "23456789";

/** Senha provisória fácil de ditar, ex.: "kpr-4827-tmx". */
export function gerarSenhaProvisoria(): string {
  const l = (n: number) => Array.from({ length: n }, () => LETRAS[randomInt(LETRAS.length)]).join("");
  const d = (n: number) => Array.from({ length: n }, () => NUMEROS[randomInt(NUMEROS.length)]).join("");
  return `${l(3)}-${d(4)}-${l(3)}`;
}

/** Regras mínimas para a senha definida pelo usuário. Retorna a mensagem de erro ou null. */
export function validarNovaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  return null;
}
