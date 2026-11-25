import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/auth";
import { ConfirmarEmbarque } from "./confirmar-embarque";

export const metadata: Metadata = { title: "Embarque" };

/**
 * Destino do QR code fixo do ônibus (seção 8). Pede a localização do celular
 * e confirma o embarque; as validações ficam na função embarcar_qr do banco.
 * O resultado ocupa a tela toda (verde/vermelho) para o motorista ver de longe.
 */
export default async function PaginaEmbarque({ params }: { params: Promise<{ token: string }> }) {
  const sessao = await exigirPerfil("aluno");
  const { token } = await params;
  return <ConfirmarEmbarque token={token} nome={sessao.nome} />;
}
