"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { Campo } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { enviarJustificativa, iniciarEnvioAnexo } from "../../acoes";

/** Foto grande do atestado fica menor antes de enviar (lado maior até 1600 px). PDF vai como está. */
async function prepararArquivo(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith("image/")) return arquivo;
  const img = await createImageBitmap(arquivo).catch(() => null);
  if (!img) return arquivo;
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? arquivo), "image/jpeg", 0.85));
}

export function FormJustificativa({ frequencia, viagem, podeJustificar }: { frequencia: number; viagem: string; podeJustificar: boolean }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 5) return toast.error("Explique o motivo da falta.");
    setEnviando(true);
    try {
      let path: string | null = null;
      if (arquivo) {
        const blob = await prepararArquivo(arquivo);
        const tipo = blob.type || arquivo.type;
        const prep = await iniciarEnvioAnexo(tipo, blob.size);
        if (!prep.ok) throw new Error(prep.erro);
        const { error } = await criarClienteNavegador().storage.from("documentos").uploadToSignedUrl(prep.path, prep.token, blob, { contentType: tipo });
        if (error) throw new Error("Não foi possível enviar o anexo. Verifique a internet e tente de novo.");
        path = prep.path;
      }
      const r = await enviarJustificativa(frequencia, motivo.trim(), path);
      if (!r.ok) throw new Error(r.erro);
      toast.success("Justificativa enviada! Você recebe um aviso quando a Secretaria de Educação analisar.");
      router.push("/app/historico");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <Link href="/app/historico" className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Justificar falta</p>
          <p className="font-semibold leading-snug text-slate-900">{viagem}</p>
        </div>
      </div>

      {!podeJustificar ? (
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-suave">
          Esta falta não pode mais ser justificada pelo app (já tem justificativa enviada ou o prazo acabou). Se precisar, procure a Secretaria de Educação.
        </p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-suave">
          <Campo rotulo="Por que você faltou?">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ex.: estava doente e fui ao médico."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-base outline-none focus:border-azul-400 focus:ring-2 focus:ring-azul-100"
              required
            />
          </Campo>

          <Campo rotulo="Atestado ou comprovante (opcional)" ajuda="Foto ou PDF, até 8 MB. Ajuda a Secretaria a aprovar.">
            {arquivo ? (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
                <FileText className="size-5 shrink-0 text-azul-600" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{arquivo.name}</span>
                <button type="button" onClick={() => setArquivo(null)} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white" aria-label="Tirar anexo">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => seletor.current?.click()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-600 hover:border-azul-300 hover:text-azul-700"
              >
                <Paperclip className="size-4" /> Anexar foto ou PDF
              </button>
            )}
            <input
              ref={seletor}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </Campo>

          <button
            type="submit"
            disabled={enviando}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-azul-600 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} Enviar justificativa
          </button>
        </form>
      )}
    </div>
  );
}
