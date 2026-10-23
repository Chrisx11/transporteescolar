import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { obterSessao } from "@/lib/auth";
import { Formulario, BotaoEnviar } from "@/components/formulario";
import { CamposNovaSenha } from "../campos-senha";
import { CabecalhoAuth } from "../cabecalho-auth";
import { trocarSenha } from "../acoes";

export const metadata: Metadata = { title: "Criar nova senha" };

export default async function PaginaTrocarSenha() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return (
    <Formulario acao={trocarSenha} className="gap-5">
      <CabecalhoAuth icone={KeyRound} titulo={`Olá, ${sessao.nome.split(" ")[0]}!`}>
        {sessao.troca_senha_obrigatoria
          ? "Para sua segurança, crie uma senha só sua antes de continuar."
          : "Escolha uma nova senha."}
      </CabecalhoAuth>
      <CamposNovaSenha />
      <BotaoEnviar className="h-12 text-base">Salvar senha</BotaoEnviar>
    </Formulario>
  );
}
