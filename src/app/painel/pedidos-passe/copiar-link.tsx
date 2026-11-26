"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { useConfirmacao } from "@/components/confirmacao";
import { gerarLinkPedido } from "./acoes";

/** wa.me usa o número com o código do país, só dígitos: (22) 99969-0000 → 5522999690000 */
function numeroWhatsApp(telefone: string | null) {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

/**
 * Gera um link novo para o aluno e:
 *  - "Copiar mensagem": copia a mensagem pronta (com o nome e o link) para colar no WhatsApp;
 *  - "WhatsApp": abre a conversa com o número do aluno e a mensagem já escrita.
 */
export function CopiarLink({ id, jaEnviado }: { id: string; jaEnviado: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [janela, confirmar] = useConfirmacao();

  async function gerar(acao: "copiar" | "whatsapp") {
    if (jaEnviado && !(await confirmar("Gerar um link novo? O link já enviado para este aluno deixa de valer."))) return;
    // A aba do WhatsApp precisa ser aberta já no clique (senão o navegador bloqueia).
    const aba = acao === "whatsapp" ? window.open("about:blank", "_blank") : null;
    iniciar(async () => {
      const r = await gerarLinkPedido(id);
      if (!r.ok) {
        aba?.close();
        toast.error(r.erro);
        return;
      }
      if (acao === "whatsapp") {
        const numero = numeroWhatsApp(r.telefone);
        const url = numero
          ? `https://wa.me/${numero}?text=${encodeURIComponent(r.mensagem)}`
          : `https://wa.me/?text=${encodeURIComponent(r.mensagem)}`;
        if (aba) aba.location.href = url;
        else window.location.href = url;
        if (!numero) toast.info("Telefone do aluno inválido: escolha o contato no WhatsApp.");
        return;
      }
      try {
        await navigator.clipboard.writeText(r.mensagem);
        setCopiado(true);
        toast.success("Mensagem copiada. Cole no WhatsApp do aluno.");
        setTimeout(() => setCopiado(false), 3000);
      } catch {
        window.prompt("Copie a mensagem para o aluno:", r.mensagem);
      }
    });
  }

  return (
    <>
      {janela}
      <button
        type="button"
        onClick={() => void gerar("copiar")}
        disabled={pendente}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-azul-700 ring-1 ring-inset ring-azul-200 hover:bg-azul-50 disabled:opacity-60"
        title="Copia a mensagem pronta, com o nome do aluno e o link"
      >
        {pendente ? <Loader2 className="size-3.5 animate-spin" /> : copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copiado ? "Copiada" : "Copiar mensagem"}
      </button>
      <button
        type="button"
        onClick={() => void gerar("whatsapp")}
        disabled={pendente}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        title="Abre o WhatsApp com o número do aluno e a mensagem já escrita"
      >
        <MessageCircle className="size-3.5" /> WhatsApp
      </button>
    </>
  );
}
