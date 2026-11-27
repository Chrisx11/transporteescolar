"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/acoes";

type Resultado = { ok: true } | { ok: false; erro: string };

export async function pedirExcecao(dados: { data: string; ida: string | null; volta: string | null; motivo: string }): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("pedir_excecao", {
      p_data: dados.data,
      p_ida: dados.ida || null,
      p_volta: dados.volta || null,
      p_motivo: dados.motivo,
    });
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app/troca-horario");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function desistirExcecao(id: string): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("desistir_excecao", { p_id: id });
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app/troca-horario");
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
