import { redirect } from "next/navigation";
import { PaginaInstalar, metadadosInstalar } from "./pagina-instalar";

export const metadata = metadadosInstalar("aluno");

/** Download do app do aluno (link para mandar aos alunos). */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  // Endereço antigo do motorista (/instalar?app=motorista).
  if ((await searchParams).app === "motorista") redirect("/instalar/motorista");
  return <PaginaInstalar app="aluno" />;
}
