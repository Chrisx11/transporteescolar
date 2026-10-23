"use client";

import { useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Estado } from "@/lib/acoes";
import { Aviso, Botao, cx, type VarianteBotao } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";

type Acao = (estado: Estado, fd: FormData) => Promise<Estado>;

/** Mensagens que o usuário precisa ler com calma (ex.: senha provisória) ficam na tela. */
const importante = (msg: string) => /senha/i.test(msg);

/**
 * Se houver `confirmar`, segura o envio, mostra a janela de confirmação e só
 * envia de novo (requestSubmit) se a pessoa confirmar.
 */
function useEnvioConfirmado(confirmar?: string) {
  const [janela, pedir] = useConfirmacao();
  const liberado = useRef(false);
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    if (!confirmar) return;
    if (liberado.current) {
      liberado.current = false;
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    void pedir(confirmar).then((ok) => {
      if (!ok) return;
      liberado.current = true;
      form.requestSubmit();
    });
  };
  return [janela, aoEnviar] as const;
}

/**
 * Formulário ligado a uma Server Action. Erros aparecem no formulário;
 * sucesso aparece como aviso flutuante (ou fixo, se tiver senha).
 */
export function Formulario({
  acao,
  children,
  className,
  limpar = false,
  confirmar,
}: {
  acao: Acao;
  children: ReactNode;
  className?: string;
  limpar?: boolean;
  confirmar?: string;
}) {
  const [estado, despachar] = useActionState(acao, null);
  const ref = useRef<HTMLFormElement>(null);
  const [janela, aoEnviar] = useEnvioConfirmado(confirmar);

  useEffect(() => {
    if (!estado?.ok) return;
    if (!importante(estado.ok)) toast.success(estado.ok);
    if (limpar) ref.current?.reset();
  }, [estado, limpar]);

  return (
    <form ref={ref} action={despachar} className={cx("flex flex-col gap-4", className)} onSubmit={aoEnviar}>
      {janela}
      {children}
      {estado?.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado?.ok && importante(estado.ok) && <Aviso tipo="ok">{estado.ok}</Aviso>}
    </form>
  );
}

export function BotaoEnviar({
  children,
  variante,
  className,
}: {
  children: ReactNode;
  variante?: VarianteBotao;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending} variante={variante} className={className}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" /> Salvando…
        </>
      ) : (
        children
      )}
    </Botao>
  );
}

/** Botão pequeno de ação (ex.: remover) que envia um formulário inline. */
export function AcaoRapida({
  acao,
  campos,
  rotulo,
  confirmar,
  variante = "perigo",
  icone,
}: {
  acao: Acao;
  campos: Record<string, string>;
  rotulo: string;
  confirmar?: string;
  variante?: VarianteBotao;
  icone?: ReactNode;
}) {
  const [estado, despachar] = useActionState(acao, null);
  const [janela, aoEnviar] = useEnvioConfirmado(confirmar);

  useEffect(() => {
    if (estado?.erro) toast.error(estado.erro);
    else if (estado?.ok) {
      if (importante(estado.ok)) toast.success(estado.ok, { duration: Infinity, closeButton: true });
      else if (estado.ok !== "Salvo com sucesso.") toast.success(estado.ok);
    }
  }, [estado]);

  return (
    <form action={despachar} className="inline-flex" onSubmit={aoEnviar}>
      {janela}
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <BotaoPequeno variante={variante} icone={icone}>
        {rotulo}
      </BotaoPequeno>
    </form>
  );
}

function BotaoPequeno({ children, variante, icone }: { children: ReactNode; variante: VarianteBotao; icone?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending} className="h-8 rounded-lg px-2.5 text-xs [&_svg]:size-3.5">
      {pending ? <Loader2 className="animate-spin" /> : icone}
      {children}
    </Botao>
  );
}
