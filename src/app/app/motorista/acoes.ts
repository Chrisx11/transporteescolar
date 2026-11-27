"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/acoes";

/** Motorista libera a volta 20:30 de Itaperuna (seção 9). As regras ficam na função do banco. */
export async function liberarVolta2030(onibusId: string, vagas: number): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await sessaoComPerfil("motorista");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("liberar_volta_2030", { p_onibus: onibusId, p_vagas: vagas });
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app/motorista");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
