/**
 * Padronização de nomes e telefones (usada nos cadastros, na importação e no banco).
 *   Nome: maiúsculas, sem espaços sobrando.
 *   Telefone: (00) 00000-0000.
 */

/** "maria  da silva " → "MARIA DA SILVA" */
export function nomePadrao(nome: string): string {
  return (nome ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

/** DDD usado quando o número vem sem DDD (região de Italva/Campos/Itaperuna). */
const DDD_PADRAO = "22";

/**
 * Coloca o telefone no padrão (00) 00000-0000. Corrige os casos comuns:
 * +55 na frente, 0 antes do DDD, número sem DDD (usa 22), celular antigo sem o 9,
 * dois números digitados juntos (fica o primeiro). Sem como corrigir, devolve o original.
 */
export function telefonePadrao(telefone: string | null | undefined): string {
  const original = (telefone ?? "").trim();
  let d = original.replace(/\D/g, "");
  if (!d) return original;
  if (d.length > 13) d = d.slice(0, d.startsWith("55") ? 13 : 11); // dois números juntos
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 9 || d.length === 8) d = DDD_PADRAO + d;
  // Celular antigo (8 dígitos começando em 6–9): acrescenta o 9.
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; // fixo
  return original;
}
