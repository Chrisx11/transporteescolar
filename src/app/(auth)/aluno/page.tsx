import type { Metadata } from "next";
import { AREAS_LOGIN } from "@/lib/rotulos";
import { PaginaLogin } from "../pagina-login";

export const metadata: Metadata = {
  title: `Entrar · ${AREAS_LOGIN.aluno.titulo}`,
  manifest: "/manifest-aluno.webmanifest",
  appleWebApp: { capable: true, title: "Transporte Italva", statusBarStyle: "black-translucent" },
};

export default function Pagina() {
  return <PaginaLogin area="aluno" />;
}
