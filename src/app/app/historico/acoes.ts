"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { mensagemErro } from "@/lib/acoes";

type Resultado = { ok: true } | { ok: false; erro: string };

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_MB = 8;

/** Prepara o envio do anexo (atestado) direto ao bucket privado "documentos", na pasta do aluno. */
export async function iniciarEnvioAnexo(tipo: string, tamanho: number): Promise<{ ok: true; path: string; token: string } | { ok: false; erro: string }> {
  try {
    const sessao = await sessaoComPerfil("aluno");
    const ext = TIPOS[tipo];
    if (!ext) return { ok: false, erro: "O anexo precisa ser foto (JPG, PNG) ou PDF." };
    if (tamanho > MAX_MB * 1024 * 1024) return { ok: false, erro: `O anexo pode ter até ${MAX_MB} MB.` };
    const path = `${sessao.id}/justificativa-${Date.now()}.${ext}`;
    const { data, error } = await criarClienteAdmin().storage.from("documentos").createSignedUploadUrl(path);
    if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
    return { ok: true, path, token: data.token };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function enviarJustificativa(frequencia: number, motivo: string, anexo: string | null): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("enviar_justificativa", { p_frequencia: frequencia, p_motivo: motivo, p_anexo: anexo });
    if (error) {
      // O anexo enviado fica órfão se a justificativa não foi aceita pelo banco.
      if (anexo) await criarClienteAdmin().storage.from("documentos").remove([anexo]);
      return { ok: false, erro: mensagemErro(error) };
    }
    revalidatePath("/app/historico");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
