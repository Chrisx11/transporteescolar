"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";

const atualizar = () => revalidatePath("/painel/dia", "layout");

export async function gerarViagens(): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("gerar_viagens_dia", { p_dias: 2 });
    if (error) throw error;
    atualizar();
    return { ok: data ? `${data} viagem(ns) criada(s).` : "As viagens dos próximos dias já estavam criadas." };
  });
}

export async function adicionarOnibusDia(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("viagem_dia_onibus").insert({
      viagem_dia_id: campoObrigatorio(fd, "viagem_dia_id", "Viagem"),
      onibus_id: campoObrigatorio(fd, "onibus_id", "Ônibus"),
      motorista_id: campo(fd, "motorista_id"),
      extra: true,
    });
    if (error) {
      if (error.code === "23505") throw new ErroValidacao("Este ônibus já está nesta viagem.");
      throw error;
    }
    atualizar();
    return { ok: "Ônibus adicionado. Use “Realocar alunos” para distribuir de novo." };
  });
}

export async function trocarMotoristaDia(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("viagem_dia_onibus")
      .update({ motorista_id: campo(fd, "motorista_id") })
      .eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    atualizar();
    return { ok: "Motorista atualizado." };
  });
}

export async function removerOnibusDia(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("viagem_dia_onibus").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    atualizar();
    return { ok: "Ônibus removido da viagem." };
  });
}

export async function realocar(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("alocar_viagem", { p_viagem: campoObrigatorio(fd, "id", "id") });
    if (error) throw error;
    atualizar();
    return { ok: `${data ?? 0} aluno(s) distribuído(s) entre os ônibus.` };
  });
}

export async function reaplicarEscala(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("reaplicar_escala", { p_viagem: campoObrigatorio(fd, "id", "id") });
    if (error) throw error;
    atualizar();
    return { ok: "Escala modelo reaplicada nesta viagem." };
  });
}

export async function cancelarViagem(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("cancelar_viagem", {
      p_viagem: campoObrigatorio(fd, "id", "id"),
      p_motivo: campoObrigatorio(fd, "motivo", "Motivo"),
    });
    if (error) throw error;
    atualizar();
    return { ok: `Viagem cancelada. ${data ?? 0} aluno(s) avisado(s).` };
  });
}

export async function moverReserva(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("mover_reserva", {
      p_reserva: campoObrigatorio(fd, "reserva_id", "Reserva"),
      p_destino: campoObrigatorio(fd, "destino", "Ônibus"),
    });
    if (error) throw error;
    atualizar();
    return { ok: "Aluno movido." };
  });
}
