import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/auth";
import { ConfirmarEmbarque } from "./confirmar-embarque";

export const metadata: Metadata = { title: "Embarque" };

/**
 * Destino do QR code fixo do ônibus (seção 8). Pede a localização do celular
 * e confirma o embarque; as validações ficam na função embarcar_qr do banco.
 */
export default async function PaginaEmbarque({ params }: { params: Promise<{ token: string }> }) {
  await exigirPerfil("aluno");
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 bg-[#f4f6fb] p-6 text-center">
      <ConfirmarEmbarque token={token} />
    </main>
  );
}
