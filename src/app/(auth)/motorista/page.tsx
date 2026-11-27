import type { Metadata } from "next";
import { AREAS_LOGIN } from "@/lib/rotulos";
import { PaginaLogin } from "../pagina-login";

export const metadata: Metadata = {
  title: `Entrar · ${AREAS_LOGIN.motorista.titulo}`,
  manifest: "/manifest-motorista.webmanifest",
  appleWebApp: { capable: true, title: "Motorista Italva", statusBarStyle: "black-translucent" },
};

export default function Pagina() {
  return <PaginaLogin area="motorista" />;
}
