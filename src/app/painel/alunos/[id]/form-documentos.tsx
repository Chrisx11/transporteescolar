"use client";

import { useActionState, useState, useTransition } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { salvarDocumentos } from "../acoes";

const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TIPOS_DOC: Record<string, string> = { ...TIPOS_FOTO, "application/pdf": "pdf" };

/** Envia os arquivos direto ao Storage (bucket privado) e depois registra no cadastro. */
export function FormDocumentos({ alunoId, validade }: { alunoId: string; validade: string | null }) {
  const [estado, despachar] = useActionState(salvarDocumentos, null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  async function enviar(bucket: "fotos" | "documentos", nome: string, arquivo: File, tipos: Record<string, string>, mb: number) {
    const ext = tipos[arquivo.type];
    if (!ext) throw new Error(`Formato não aceito. Use ${Object.values(tipos).join(", ").toUpperCase()}.`);
    if (arquivo.size > mb * 1024 * 1024) throw new Error(`O arquivo passa de ${mb} MB.`);
    const path = `${alunoId}/${nome}-${Date.now()}.${ext}`;
    const { error } = await criarClienteNavegador()
      .storage.from(bucket)
      .upload(path, arquivo, { contentType: arquivo.type });
    if (error) throw new Error("Não foi possível enviar o arquivo. Tente de novo.");
    return path;
  }

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = e.currentTarget;
    const dados = new FormData(form);
    iniciar(async () => {
      try {
        const fd = new FormData();
        fd.set("id", alunoId);
        fd.set("matricula_validade", String(dados.get("matricula_validade") ?? ""));
        const foto = dados.get("foto");
        if (foto instanceof File && foto.size > 0) fd.set("foto_path", await enviar("fotos", "foto", foto, TIPOS_FOTO, 5));
        const comp = dados.get("comprovante");
        if (comp instanceof File && comp.size > 0) {
          fd.set("comprovante_path", await enviar("documentos", "comprovante", comp, TIPOS_DOC, 10));
        }
        despachar(fd);
        form.querySelectorAll<HTMLInputElement>("input[type=file]").forEach((i) => (i.value = ""));
      } catch (err) {
        setErro((err as Error).message);
      }
    });
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-4">
      <Campo rotulo="Nova foto (JPG, PNG ou WEBP, até 5 MB)">
        <Entrada name="foto" type="file" accept="image/jpeg,image/png,image/webp" />
      </Campo>
      <Campo rotulo="Novo comprovante (PDF ou imagem, até 10 MB)">
        <Entrada name="comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
      </Campo>
      <Campo rotulo="Matrícula válida até">
        <Entrada name="matricula_validade" type="date" defaultValue={validade ?? ""} />
      </Campo>
      {(erro || estado?.erro) && <Aviso tipo="erro">{erro ?? estado?.erro}</Aviso>}
      {estado?.ok && !erro && <Aviso tipo="ok">{estado.ok}</Aviso>}
      <div>
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Salvar documentos"}
        </Botao>
      </div>
    </form>
  );
}
