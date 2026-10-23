import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave de serviço (ignora RLS). Usar SOMENTE no servidor e
 * apenas para o que o usuário não pode fazer com a própria sessão:
 * criar/alterar logins no Auth, buscar o e-mail de login pelo CPF e
 * registrar tentativas de login.
 */
export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Variáveis do Supabase não configuradas.");
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
