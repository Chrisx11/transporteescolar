import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { COOKIE_MODO_ADMIN, obterSessao } from "@/lib/auth";

/** Sai e volta para a página de login do próprio perfil. */
export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_MODO_ADMIN);
  const destino = sessao ? `/login/${sessao.perfil}` : "/login";
  return NextResponse.redirect(new URL(destino, req.url), { status: 303 });
}
