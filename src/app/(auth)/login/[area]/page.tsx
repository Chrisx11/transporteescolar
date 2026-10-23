import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AREAS_LOGIN, ehPerfil } from "@/lib/rotulos";
import { FormLogin } from "../form-login";

export function generateStaticParams() {
  return Object.keys(AREAS_LOGIN).map((area) => ({ area }));
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  return { title: ehPerfil(area) ? `Entrar · ${AREAS_LOGIN[area].titulo}` : "Entrar" };
}

export default async function PaginaLoginArea({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>;
  searchParams: Promise<{ voltar?: string }>;
}) {
  const { area } = await params;
  if (!ehPerfil(area)) notFound();
  const { voltar } = await searchParams;
  return <FormLogin area={area} voltar={voltar?.startsWith("/") && !voltar.startsWith("//") ? voltar : undefined} />;
}
