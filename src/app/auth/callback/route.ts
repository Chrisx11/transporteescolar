import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Retorno do link de recuperação de senha enviado por e-mail. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const proximo = url.searchParams.get("proximo") ?? "/redefinir-senha";
  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(proximo.startsWith("/") ? proximo : "/", url.origin));
  }
  return NextResponse.redirect(new URL("/login?erro=link", url.origin));
}
