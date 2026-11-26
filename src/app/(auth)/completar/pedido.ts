import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { resumoCodigo } from "@/lib/codigo-link";

/** Pedido aguardando complemento, com link dentro da validade. */
export async function pedidoDoCodigo(codigo: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(codigo)) return null;
  const { data } = await criarClienteAdmin()
    .from("pre_cadastros")
    .select("id, nome, email, telefone, cidade, curso, periodo, turno, endereco, bairro, data_nascimento, instituicao_outra, codigo_expira_em, instituicao:instituicoes(nome)")
    .eq("codigo_hash", resumoCodigo(codigo))
    .eq("status", "aguardando")
    .maybeSingle();
  if (!data || (data.codigo_expira_em && new Date(data.codigo_expira_em) < new Date())) return null;
  return data;
}
