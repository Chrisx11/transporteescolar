import { notFound, redirect } from "next/navigation";
import { ehPerfil } from "@/lib/rotulos";

/** Endereço antigo /login/<perfil> → /<perfil>. */
export default async function LoginAreaAntigo({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { area } = await params;
  if (!ehPerfil(area)) notFound();
  const q = new URLSearchParams(await searchParams).toString();
  redirect(q ? `/${area}?${q}` : `/${area}`);
}
