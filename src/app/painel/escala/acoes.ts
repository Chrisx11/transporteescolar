"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";
import { DIAS_SEMANA } from "@/lib/tempo";

export async function adicionarEscala(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("escala_modelo").insert({
      viagem_modelo_id: campoObrigatorio(fd, "viagem_modelo_id", "Viagem"),
      dia_semana: Number(campoObrigatorio(fd, "dia_semana", "Dia")),
      onibus_id: campoObrigatorio(fd, "onibus_id", "Ônibus"),
      motorista_id: campo(fd, "motorista_id"),
    });
    if (error) {
      if (error.code === "23505") throw new ErroValidacao("Este ônibus já está nesta viagem.");
      throw error;
    }
    revalidatePath("/painel/escala");
  });
}

export async function removerEscala(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("escala_modelo").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/escala");
  });
}

/** Copia a escala de um dia para outro (substitui a do dia de destino). */
export async function copiarEscala(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const origem = Number(campoObrigatorio(fd, "origem", "Dia de origem"));
    const destino = Number(campoObrigatorio(fd, "destino", "Dia de destino"));
    if (origem === destino) throw new ErroValidacao("Escolha um dia diferente.");

    // Função no banco: apaga e copia numa única transação.
    const supabase = await criarClienteServidor();
    const { data: total, error } = await supabase.rpc("copiar_escala_modelo", {
      p_origem: origem,
      p_destino: destino,
    });
    if (error) throw error;
    revalidatePath("/painel/escala");
    const nome = DIAS_SEMANA.find((d) => d.valor === destino)?.nome;
    return { ok: `${total ?? 0} escala(s) copiada(s) para ${nome}.` };
  });
}
