"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";

function dadosOnibus(fd: FormData) {
  const capacidade = Number(campoObrigatorio(fd, "capacidade", "Capacidade"));
  if (!Number.isInteger(capacidade) || capacidade <= 0) throw new ErroValidacao("Capacidade inválida.");
  return {
    prefixo: campoObrigatorio(fd, "prefixo", "Prefixo").toUpperCase(),
    placa: campoObrigatorio(fd, "placa", "Placa").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    capacidade,
    situacao: campo(fd, "situacao") ?? "ativo",
    vistoria_validade: campo(fd, "vistoria_validade"),
    licenciamento_validade: campo(fd, "licenciamento_validade"),
  };
}

export async function salvarOnibus(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campo(fd, "id");
    const dados = dadosOnibus(fd);
    const { error } = id
      ? await supabase.from("onibus").update(dados).eq("id", id)
      : await supabase.from("onibus").insert(dados);
    if (error) throw error;
    revalidatePath("/painel/onibus");
    return { ok: id ? "Ônibus atualizado." : "Ônibus cadastrado." };
  });
}

export async function excluirOnibus(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("onibus").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/onibus");
  });
}

/** Gera um QR novo (o adesivo antigo deixa de funcionar). */
export async function regenerarQr(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campoObrigatorio(fd, "id", "id");
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const { error } = await supabase.from("onibus").update({ qr_token: token }).eq("id", id);
    if (error) throw error;
    revalidatePath(`/painel/onibus/${id}/adesivo`);
    return { ok: "QR novo gerado. Imprima e troque o adesivo." };
  });
}
