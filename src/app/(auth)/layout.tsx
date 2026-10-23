import { BellRing, CalendarCheck2, QrCode } from "lucide-react";
import { Marca } from "@/components/ui";

const DESTAQUES = [
  { icone: CalendarCheck2, titulo: "Reserva pelo celular", texto: "Escolha ida e volta do dia dentro do prazo." },
  { icone: QrCode, titulo: "Embarque com QR code", texto: "Leia o código do ônibus e pronto." },
  { icone: BellRing, titulo: "Avisos no WhatsApp", texto: "Saiba qual ônibus pegar e qualquer mudança." },
];

/** Telas de acesso: painel institucional à esquerda (computador) e formulário à direita. */
export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-azul-700 via-azul-800 to-azul-950 p-12 text-white lg:flex lg:flex-col">
        <div className="fundo-pontos absolute inset-0" aria-hidden />
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-azul-400/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-destaque-400/20 blur-3xl" aria-hidden />

        <div className="relative flex items-center gap-3">
          <Marca className="size-11" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-azul-200">Prefeitura de Italva</p>
            <p className="text-lg font-bold">Transporte Universitário</p>
          </div>
        </div>

        <div className="relative my-auto max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Ir para a faculdade ficou <span className="text-destaque-400">mais simples.</span>
          </h2>
          <p className="mt-4 text-azul-100/90">
            Transporte gratuito para os universitários de Italva que estudam em Campos dos Goytacazes e Itaperuna.
          </p>
          <ul className="mt-10 flex flex-col gap-5">
            {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <Icone className="size-5 text-destaque-400" />
                </span>
                <span>
                  <span className="block font-semibold">{titulo}</span>
                  <span className="text-sm text-azul-100/80">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-azul-200/70">Secretaria Municipal de Educação · Secretaria Municipal de Transportes</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
          <Marca className="mb-3 size-14" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-azul-600">Prefeitura de Italva</p>
          <p className="text-lg font-bold text-slate-900">Transporte Universitário</p>
        </div>
        <div className="w-full max-w-md animate-surgir rounded-3xl border border-slate-200/80 bg-white p-6 shadow-elevada sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
