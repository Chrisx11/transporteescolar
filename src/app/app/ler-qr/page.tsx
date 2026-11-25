import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/auth";
import { LeitorQRCode } from "./leitor";

export const metadata: Metadata = { title: "Ler QR code" };

export default async function PaginaLerQR() {
  await exigirPerfil("aluno");
  return <LeitorQRCode />;
}
