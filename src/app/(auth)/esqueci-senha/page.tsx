import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MailQuestion, Send } from "lucide-react";
import { Formulario, BotaoEnviar } from "@/components/formulario";
import { Campo, Entrada } from "@/components/ui";
import { CabecalhoAuth } from "../cabecalho-auth";
import { pedirRecuperacao } from "../acoes";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function PaginaEsqueciSenha() {
  return (
    <Formulario acao={pedirRecuperacao} className="gap-5">
      <CabecalhoAuth icone={MailQuestion} titulo="Esqueci minha senha">
        Informe seu CPF. Vamos enviar um link para o e-mail cadastrado.
      </CabecalhoAuth>
      <Campo rotulo="CPF">
        <Entrada name="cpf" inputMode="numeric" placeholder="000.000.000-00" className="h-12 text-base" required />
      </Campo>
      <BotaoEnviar className="h-12 text-base">
        <Send /> Enviar link
      </BotaoEnviar>
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Voltar para o login
      </Link>
    </Formulario>
  );
}
