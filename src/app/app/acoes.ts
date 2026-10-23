"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/acoes";

type Resultado = { ok: true } | { ok: false; erro: string };

/** Reserva um trecho. As regras (grade, prazo, calendário, matrícula) ficam na função do banco. */
export async function reservarViagem(viagemDiaId: string): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("reservar", { p_viagem: viagemDiaId });
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function cancelarReserva(reservaId: string): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("cancelar_reserva", { p_reserva: reservaId });
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
