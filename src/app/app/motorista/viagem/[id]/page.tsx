import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/auth";
import { TelaTrecho } from "./tela-trecho";

export const metadata: Metadata = { title: "Viagem" };

/**
 * Trecho do motorista (seção 7.4): iniciar, lista de embarque por ponto,
 * presença manual, envio de localização e encerrar. Os dados são carregados
 * no celular e ficam salvos nele para funcionar com sinal fraco.
 */
export default async function PaginaTrecho({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("motorista");
  const { id } = await params;
  return <TelaTrecho vdo={id} />;
}
