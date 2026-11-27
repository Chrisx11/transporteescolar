import Link from "next/link";
import type { Metadata } from "next";
import { PainelInstalar, type QualApp } from "@/components/instalar-app";

export function metadadosInstalar(app: QualApp): Metadata {
  return {
    title: app === "motorista" ? "Baixar o app do motorista" : "Baixar o app",
    description: "Instale o app do transporte universitário de Italva no seu celular.",
    manifest: `/manifest-${app}.webmanifest`,
    appleWebApp: { capable: true, title: app === "motorista" ? "Motorista Italva" : "Transporte Italva", statusBarStyle: "black-translucent" },
  };
}

/** Página de download de um app só (aluno em /instalar, motorista em /instalar/motorista). */
export function PaginaInstalar({ app }: { app: QualApp }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{app === "motorista" ? "App do motorista" : "Baixar o app"}</h1>
        <p className="text-sm text-slate-500">
          {app === "motorista" ? "Suas viagens e listas de embarque na tela do celular." : "Tenha o transporte universitário na tela do seu celular."}
        </p>
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
