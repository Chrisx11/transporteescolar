"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemErro } from "@/lib/acoes";

type Resultado = { ok: true } | { ok: false; erro: string };

/** Reserva um trecho. As regras (grade, prazo, calendário, matrícula) ficam na função do banco. */
export async function reservarViagem(
  viagemDiaId: string,
  pontoEmbarque: string | null = null,
  pontoDesembarque: string | null = null,
): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    // Reservar de novo a mesma viagem (com o prazo aberto) só troca os pontos.
    const { error } = await supabase.rpc("reservar", {
      p_viagem: viagemDiaId,
      p_ponto_embarque: pontoEmbarque,
      p_ponto_desembarque: pontoDesembarque,
    });
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * Reserva a ida e, em seguida, a volta escolhida (se houver). Se a ida der certo
 * e a volta não, a ida fica reservada e o erro da volta volta como aviso.
 */
export async function reservarIdaEVolta(
  ida: { viagem: string; embarque: string | null; desembarque: string | null },
  volta: { viagem: string; embarque: string | null; desembarque: string | null } | null,
): Promise<{ ok: true; erroVolta?: string } | { ok: false; erro: string }> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const r = await supabase.rpc("reservar", { p_viagem: ida.viagem, p_ponto_embarque: ida.embarque, p_ponto_desembarque: ida.desembarque });
    if (r.error) return { ok: false, erro: mensagemErro(r.error) };
    let erroVolta: string | undefined;
    if (volta) {
      const v = await supabase.rpc("reservar", { p_viagem: volta.viagem, p_ponto_embarque: volta.embarque, p_ponto_desembarque: volta.desembarque });
      if (v.error) erroVolta = mensagemErro(v.error);
    }
    revalidatePath("/app");
    return { ok: true, erroVolta };
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

/** Volta 20:30 de Itaperuna: entra na lista (continua na 22:00 até confirmar). */
export async function reservarVolta2030(): Promise<{ ok: true; confirmada: boolean; faltam?: number } | { ok: false; erro: string }> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("reservar_volta_2030");
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app");
    const r = data as { confirmada: boolean; faltam?: number };
    return { ok: true, confirmada: r.confirmada, faltam: r.faltam };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Volta 20:30: sai da lista antes de confirmar (continua na 22:00). */
export async function desistirVolta2030(): Promise<Resultado> {
  try {
    await sessaoComPerfil("aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("desistir_volta_2030");
    if (error) return { ok: false, erro: mensagemErro(error) };
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
