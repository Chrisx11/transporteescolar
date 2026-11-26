import type { Metadata } from "next";
import { FormPrimeiroAcesso } from "./form-primeiro-acesso";

export const metadata: Metadata = { title: "Primeiro acesso" };

/** Primeiro acesso do aluno aprovado: só o CPF (a primeira senha é o próprio CPF). */
export default function PaginaPrimeiroAcesso() {
  return <FormPrimeiroAcesso />;
}
