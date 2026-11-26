import type { Metadata } from "next";
import { AREAS_LOGIN } from "@/lib/rotulos";
import { PaginaLogin } from "../pagina-login";

export const metadata: Metadata = { title: `Entrar · ${AREAS_LOGIN.semeduc.titulo}` };

export default function Pagina() {
  return <PaginaLogin area="semeduc" />;
}
