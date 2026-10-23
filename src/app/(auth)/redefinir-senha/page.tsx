import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Formulario, BotaoEnviar } from "@/components/formulario";
import { CamposNovaSenha } from "../campos-senha";
import { CabecalhoAuth } from "../cabecalho-auth";
import { redefinirSenha } from "../acoes";

export const metadata: Metadata = { title: "Nova senha" };

export default function PaginaRedefinirSenha() {
  return (
    <Formulario acao={redefinirSenha} className="gap-5">
      <CabecalhoAuth icone={KeyRound} titulo="Criar nova senha" />
      <CamposNovaSenha />
      <BotaoEnviar className="h-12 text-base">Salvar senha</BotaoEnviar>
    </Formulario>
  );
}
