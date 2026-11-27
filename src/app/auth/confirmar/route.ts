import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Link do e-mail "Esqueci minha senha" (modelo do Supabase com {{ .TokenHash }}):
 *   <site>/auth/confirmar?token_hash=...&type=recovery
 * Diferente do /auth/callback, funciona mesmo se o aluno abrir o e-mail em outro
 * navegador ou celular (não depende de nada guardado no navegador que pediu).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = (url.searchParams.get("type") ?? "recovery") as EmailOtpType;
  const proximo = url.searchParams.get("proximo") ?? "/redefinir-senha";
  if (tokenHash) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/redefinir-senha", url.origin));
  }
  return NextResponse.redirect(new URL("/aluno?erro=link", url.origin));
}
