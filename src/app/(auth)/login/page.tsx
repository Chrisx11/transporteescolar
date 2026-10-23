import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Aviso, cx } from "@/components/ui";
import { VISUAL_PERFIL } from "@/components/perfis-visual";
import { AREAS_LOGIN, type Perfil } from "@/lib/rotulos";

export const metadata: Metadata = { title: "Entrar" };

const ORDEM: Perfil[] = ["aluno", "motorista", "semeduc", "semtransp", "admin"];

/** Escolha da área de acesso. Cada perfil tem a própria página de login. */
export default async function PaginaEscolhaLogin({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string; erro?: string; senha?: string }>;
}) {
  const { voltar, erro, senha } = await searchParams;
  const sufixo = voltar?.startsWith("/") && !voltar.startsWith("//") ? `?voltar=${encodeURIComponent(voltar)}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bem-vindo!</h1>
        <p className="mt-1 text-sm text-slate-500">Escolha como você quer entrar.</p>
      </div>
      {erro === "link" && <Aviso>O link expirou ou já foi usado. Peça um novo.</Aviso>}
      {senha === "redefinida" && <Aviso tipo="ok">Senha alterada. Escolha sua área e entre com a nova senha.</Aviso>}
      <nav className="flex flex-col gap-2.5">
        {ORDEM.map((p) => {
          const { icone: Icone, gradiente } = VISUAL_PERFIL[p];
          return (
            <Link
              key={p}
              href={`/login/${p}${sufixo}`}
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-azul-300 hover:shadow-elevada"
            >
              <span
                className={cx(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-200 group-hover:scale-105",
                  gradiente,
                )}
              >
                <Icone className="size-6" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold text-slate-900">{AREAS_LOGIN[p].titulo}</span>
                <span className="truncate text-xs text-slate-500">{AREAS_LOGIN[p].descricao}</span>
              </span>
              <ChevronRight className="ml-auto size-5 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-azul-600" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
