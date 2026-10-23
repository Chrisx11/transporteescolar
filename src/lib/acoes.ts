/** Resultado padrão das Server Actions usadas nos formulários. */
export type Estado = { erro?: string; ok?: string; dados?: Record<string, string> } | null;

/** Traduz erros do Postgres/Supabase para mensagens simples. */
export function mensagemErro(e: unknown): string {
  const err = e as { code?: string; message?: string; details?: string } | null;
  if (!err) return "Erro desconhecido.";
  switch (err.code) {
    case "23505":
      return "Já existe um cadastro com esses dados (registro duplicado).";
    case "23503":
      return "Este registro está sendo usado em outro cadastro e não pode ser removido.";
    case "23514":
      return "Algum dado está fora do formato aceito. Confira os campos.";
    case "42501":
      return "Você não tem permissão para esta ação.";
    case "P0001":
      return err.message ?? "Operação não permitida.";
  }
  if (err.message?.includes("cpf_valido")) return "CPF inválido.";
  return err.message ?? "Não foi possível salvar. Tente novamente.";
}

/** Lê um campo de texto do formulário; string vazia vira null. */
export function campo(fd: FormData, nome: string): string | null {
  const v = fd.get(nome);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function campoObrigatorio(fd: FormData, nome: string, rotulo: string): string {
  const v = campo(fd, nome);
  if (v === null) throw new ErroValidacao(`Preencha o campo "${rotulo}".`);
  return v;
}

export class ErroValidacao extends Error {}

/** Executa a ação e converte qualquer erro em { erro }. */
export async function executar(fn: () => Promise<Estado | void>): Promise<Estado> {
  try {
    return (await fn()) ?? { ok: "Salvo com sucesso." };
  } catch (e) {
    if (e instanceof ErroValidacao) return { erro: e.message };
    if (e instanceof Error && !("code" in e)) {
      // Redirecionamentos do Next precisam continuar sendo lançados.
      if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
      return { erro: e.message };
    }
    return { erro: mensagemErro(e) };
  }
}
