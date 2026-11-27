import { PaginaInstalar, metadadosInstalar } from "../pagina-instalar";

export const metadata = metadadosInstalar("motorista");

/** Download do app do motorista (link para mandar aos motoristas). */
export default function Pagina() {
  return <PaginaInstalar app="motorista" />;
}
