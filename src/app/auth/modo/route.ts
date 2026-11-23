import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_MODO_ADMIN, ehModoAdmin, obterSessao } from "@/lib/auth";
import { inicioDoPerfil } from "@/lib/rotulos";

/** Admin troca a área que está vendo: /auth/modo?para=aluno|motorista|painel */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao?.admin) return NextResponse.redirect(new URL("/login", req.url));
  const para = req.nextUrl.searchParams.get("para");
  const jar = await cookies();
  if (ehModoAdmin(para)) jar.set(COOKIE_MODO_ADMIN, para, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  else jar.delete(COOKIE_MODO_ADMIN);
  return NextResponse.redirect(new URL(ehModoAdmin(para) ? inicioDoPerfil(para) : "/painel", req.url));
}
