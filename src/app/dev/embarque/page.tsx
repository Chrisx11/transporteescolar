import { notFound } from "next/navigation";
import { Previa } from "./previa";

/**
 * Prévia das telas de resultado do QR, só no servidor local (npm run dev).
 * Em produção esta página não existe (404).
 */
export default async function PreviaEmbarque({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { estado } = await searchParams;
  return <Previa estado={estado ?? "ok"} />;
}
