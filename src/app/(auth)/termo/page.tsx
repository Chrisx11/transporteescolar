import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { Formulario, BotaoEnviar } from "@/components/formulario";
import { ShieldCheck } from "lucide-react";
import { CabecalhoAuth } from "../cabecalho-auth";
import { aceitarTermo } from "../acoes";

export const metadata: Metadata = { title: "Termo de uso" };

export default async function PaginaTermo() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return (
    <Formulario acao={aceitarTermo} className="gap-5">
      <CabecalhoAuth icone={ShieldCheck} titulo="Termo de uso e privacidade">Leia com atenção antes de começar.</CabecalhoAuth>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        <p>
          Este aplicativo é da Prefeitura de Italva e serve para organizar o transporte universitário gratuito:
          reservas, embarque e frequência.
        </p>
        <p>
          <strong>Dados que usamos:</strong> nome, CPF, data de nascimento, contato (WhatsApp e e-mail), endereço,
          foto, comprovante de matrícula e sua grade de horários.
        </p>
        <p>
          <strong>Localização:</strong> só é lida no momento em que você escaneia o QR code do ônibus, para
          confirmar que você está perto dele. Não acompanhamos sua localização em outros momentos.
        </p>
        <p>
          <strong>Foto:</strong> aparece para o motorista na lista de embarque, para identificação.
        </p>
        <p>
          <strong>Quem vê seus dados:</strong> a Secretaria de Educação, a Secretaria de Transportes e o motorista
          da sua viagem, apenas para a operação do transporte.
        </p>
        <p>Você pode pedir a correção dos seus dados ou tirar dúvidas na Secretaria de Educação.</p>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50">
        <input type="checkbox" name="aceito" className="mt-0.5 size-4 accent-azul-600" />
        <span>Li e aceito o termo de uso e privacidade.</span>
      </label>
      <BotaoEnviar className="h-12 text-base">Continuar</BotaoEnviar>
    </Formulario>
  );
}
