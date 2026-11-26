import type { Metadata } from "next";
import { FormContinuar } from "./form-continuar";

export const metadata: Metadata = { title: "Continuar cadastro" };

/** Link único para os alunos das planilhas completarem o pedido de passe. */
export default function PaginaContinuar() {
  return <FormContinuar />;
}
