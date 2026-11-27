import type { Metadata } from "next";
import Link from "next/link";
import { cx } from "@/components/ui";
import { PainelInstalar, type QualApp } from "@/components/instalar-app";

type Props = { searchParams: Promise<{ app?: string }> };

const qual = (v?: string): QualApp => (v === "motorista" ? "motorista" : "aluno");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const app = qual((await searchParams).app);
  return {
    title: "Baixar o app",
    description: "Instale o app do transporte universitário de Italva no seu celular.",
    manifest: `/manifest-${app}.webmanifest`,
    appleWebApp: { capable: true, title: app === "motorista" ? "Motorista Italva" : "Transporte Italva", statusBarStyle: "black-translucent" },
  };
}

/** Link público para mandar no WhatsApp: instala o app do aluno (ou do motorista, ?app=motorista). */
export default async function PaginaInstalar({ searchParams }: Props) {
  const app = qual((await searchParams).app);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Baixar o app</h1>
        <p className="text-sm text-slate-500">Tenha o transporte universitário na tela do seu celular.</p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(["aluno", "motorista"] as const).map((a) => (
          <Link
            key={a}
            href={a === "aluno" ? "/instalar" : "/instalar?app=motorista"}
            replace
            className={cx("rounded-lg py-2 text-center text-sm font-semibold", a === app ? "bg-white text-azul-800 shadow-sm" : "text-slate-600")}
          >
            {a === "aluno" ? "Sou aluno" : "Sou motorista"}
          </Link>
        ))}
      </div>
      <PainelInstalar app={app} />
      <p className="border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
        Já instalou?{" "}
        <Link href={app === "motorista" ? "/motorista" : "/aluno"} className="font-semibold text-azul-700 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
