"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2 } from "lucide-react";
import { useConfirmacao } from "@/components/confirmacao";
import { gerarLinkPedido } from "./acoes";

/** Gera um link novo para o aluno e copia (para mandar pelo WhatsApp, por exemplo). */
export function CopiarLink({ id, jaEnviado }: { id: string; jaEnviado: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [janela, confirmar] = useConfirmacao();

  async function copiar() {
    if (jaEnviado && !(await confirmar("Gerar um link novo? O link já enviado por e-mail para este aluno deixa de valer."))) return;
    iniciar(async () => {
      const r = await gerarLinkPedido(id);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      try {
        await navigator.clipboard.writeText(r.link);
        setCopiado(true);
        toast.success("Link copiado. Cole no WhatsApp do aluno.");
        setTimeout(() => setCopiado(false), 3000);
      } catch {
        window.prompt("Copie o link do aluno:", r.link);
      }
    });
  }

  return (
    <>
      {janela}
      <button
        type="button"
        onClick={() => void copiar()}
        disabled={pendente}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-azul-700 ring-1 ring-inset ring-azul-200 hover:bg-azul-50 disabled:opacity-60"
      >
        {pendente ? <Loader2 className="size-3.5 animate-spin" /> : copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copiado ? "Copiado" : "Copiar link"}
      </button>
    </>
  );
}
