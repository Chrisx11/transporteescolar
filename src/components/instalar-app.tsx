"use client";

import { useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Copy,
  Download,
  EllipsisVertical,
  ExternalLink,
  Loader2,
  MonitorDown,
  Share,
  SquarePlus,
  WifiOff,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Botao, cx } from "@/components/ui";
import { useInstalacao, type Plataforma } from "@/lib/instalacao";

export type QualApp = "aluno" | "motorista";

const NOME: Record<QualApp, string> = { aluno: "Transporte Italva", motorista: "Motorista Italva" };

const VANTAGENS: Record<QualApp, { icone: typeof Zap; texto: string }[]> = {
  aluno: [
    { icone: Zap, texto: "Abre direto na tela de reservas, sem digitar endereço" },
    { icone: BellRing, texto: "Recebe os avisos do seu ônibus" },
    { icone: Download, texto: "Não ocupa espaço: não precisa de loja de apps" },
  ],
  motorista: [
    { icone: Zap, texto: "Abre direto nas suas viagens do dia" },
    { icone: WifiOff, texto: "A lista de embarque funciona mesmo com sinal fraco" },
    { icone: Download, texto: "Não ocupa espaço: não precisa de loja de apps" },
  ],
};

/** Ícone do app como aparece na tela do celular. */
export function IconeApp({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icones/icone-192.png" alt="" className={cx("rounded-[22%] shadow-lg ring-1 ring-black/5", className)} />
  );
}

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-azul-600 text-sm font-bold text-white">{n}</span>
      <span className="pt-0.5 text-sm leading-relaxed text-slate-700">{children}</span>
    </li>
  );
}

/** Mostra um botão do navegador em destaque, do jeito que o aluno vai ver. */
function Tecla({ icone: Icone, children }: { icone: typeof Share; children?: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-slate-800 ring-1 ring-slate-200">
      <Icone className="size-3.5" />{children ? <> {children}</> : null}
    </span>
  );
}

function Instrucoes({ plataforma, app }: { plataforma: Plataforma; app: QualApp }) {
  if (plataforma === "ios-safari" || plataforma === "ios-outro")
    return (
      <ol className="flex flex-col gap-3">
        <Passo n={1}>
          Toque em <Tecla icone={Share}>Compartilhar</Tecla>
          {plataforma === "ios-safari" ? " na barra de baixo do Safari." : " (no Chrome fica no alto, ao lado do endereço)."}
        </Passo>
        <Passo n={2}>
          Role a lista e toque em <Tecla icone={SquarePlus}>Adicionar à Tela de Início</Tecla>.
        </Passo>
        <Passo n={3}>
          Toque em <strong>Adicionar</strong>. O ícone <strong>{NOME[app]}</strong> aparece na tela do iPhone.
        </Passo>
      </ol>
    );
  if (plataforma === "android-manual")
    return (
      <ol className="flex flex-col gap-3">
        <Passo n={1}>
          Toque no menu <Tecla icone={EllipsisVertical} /> do navegador (no canto de cima ou de baixo).
        </Passo>
        <Passo n={2}>
          Toque em <Tecla icone={Download}>Instalar app</Tecla> ou <Tecla icone={SquarePlus}>Adicionar à tela inicial</Tecla>.
        </Passo>
        <Passo n={3}>
          Confirme. O ícone <strong>{NOME[app]}</strong> aparece junto com os outros apps.
        </Passo>
      </ol>
    );
  if (plataforma === "computador-manual")
    return (
      <ol className="flex flex-col gap-3">
        <Passo n={1}>
          Abra este site no <strong>Google Chrome</strong> ou no <strong>Microsoft Edge</strong>.
        </Passo>
        <Passo n={2}>
          Clique no ícone <Tecla icone={MonitorDown}>Instalar</Tecla> na barra de endereço (ou no menu ⋮ → Instalar).
        </Passo>
        <Passo n={3}>No celular é ainda melhor: abra este mesmo endereço no navegador do celular.</Passo>
      </ol>
    );
  return null;
}

/**
 * Conteúdo de "Baixar o app": botão de instalar quando o navegador permite;
 * passo a passo no iPhone e nos navegadores que não têm o botão.
 */
export function PainelInstalar({ app }: { app: QualApp }) {
  const { plataforma, instalar } = useInstalacao();
  const [instalando, setInstalando] = useState(false);

  async function clicarInstalar() {
    setInstalando(true);
    const ok = await instalar();
    setInstalando(false);
    if (ok) toast.success("App instalado! Procure o ícone na tela do seu celular.");
  }

  async function copiarLink() {
    const url = `${location.origin}${app === "motorista" ? "/motorista" : "/aluno"}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Endereço copiado. Cole no Chrome ou no Safari.");
    } catch {
      toast.info(url);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <IconeApp className="size-16" />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight text-slate-900">{NOME[app]}</p>
          <p className="text-sm text-slate-500">Prefeitura de Italva · gratuito</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {VANTAGENS[app].map(({ icone: Icone, texto }) => (
          <li key={texto} className="flex items-center gap-3 text-sm text-slate-700">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-azul-50 text-azul-700">
              <Icone className="size-4" />
            </span>
            {texto}
          </li>
        ))}
      </ul>

      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        {plataforma === null ? (
          <div className="flex h-12 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : plataforma === "instalado" ? (
          <p className="flex items-center gap-2.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="size-6 shrink-0" /> Você já está usando o app. Tudo certo!
          </p>
        ) : plataforma === "pronto" ? (
          <div className="flex flex-col gap-2">
            <Botao onClick={() => void clicarInstalar()} disabled={instalando} className="h-14 w-full text-base">
              {instalando ? <Loader2 className="animate-spin" /> : <Download />} Instalar o app
            </Botao>
            <p className="text-center text-xs text-slate-500">Leva poucos segundos. Depois é só abrir pelo ícone.</p>
          </div>
        ) : plataforma === "navegador-interno" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              Você abriu o link dentro de outro app (WhatsApp, Instagram…). Para instalar, abra no navegador do celular:
            </p>
            <ol className="flex flex-col gap-3">
              <Passo n={1}>
                Toque em <Tecla icone={EllipsisVertical} /> ou <Tecla icone={ExternalLink}>Abrir no navegador</Tecla>.
              </Passo>
              <Passo n={2}>Lá, abra o menu e toque em “Baixar o app” de novo.</Passo>
            </ol>
            <Botao variante="secundario" onClick={() => void copiarLink()} className="h-11 w-full">
              <Copy /> Copiar o endereço do app
            </Botao>
          </div>
        ) : (
          <Instrucoes plataforma={plataforma} app={app} />
        )}
      </div>
    </div>
  );
}
