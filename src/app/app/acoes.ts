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

export type RespostaEmbarque =
  | { ok: true; mensagem: string; prefixo: string | null; viagem: string; verificado: boolean }
  | { ok: false; erro: string };

/** Confirma o embarque pelo QR do ônibus. Todas as validações ficam na função embarcar_qr do banco. */
export async function confirmarEmbarque(token: string, lat: number | null, lng: number | null): Promise<RespostaEmbarque> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("embarcar_qr", { p_token: token, p_lat: lat, p_lng: lng });
    if (error) return { ok: false, erro: mensagemErro(error) };
    const r = data as { mensagem: string; prefixo: string | null; viagem: string; verificado_localizacao?: boolean };
    revalidatePath("/app");
    return { ok: true, mensagem: r.mensagem, prefixo: r.prefixo, viagem: r.viagem, verificado: !!r.verificado_localizacao };
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
