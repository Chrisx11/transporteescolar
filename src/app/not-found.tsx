import { MapPinOff } from "lucide-react";
import { BotaoLink, Marca } from "@/components/ui";

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Marca className="mb-8 size-12" />
      <span className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-azul-50 text-azul-600 ring-8 ring-azul-50/60">
        <MapPinOff className="size-8" />
      </span>
      <p className="text-sm font-semibold uppercase tracking-wider text-azul-600">Erro 404</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Este endereço não existe ou foi removido. Confira o link ou volte para o início.
      </p>
      <BotaoLink href="/" className="mt-6">
        Voltar para o início
      </BotaoLink>
    </main>
  );
}
