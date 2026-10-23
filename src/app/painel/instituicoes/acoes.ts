"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";

export async function salvarInstituicao(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const id = campo(fd, "id");
    const dados = {
      nome: campoObrigatorio(fd, "nome", "Nome"),
      cidade: campoObrigatorio(fd, "cidade", "Cidade"),
      endereco: campo(fd, "endereco"),
      ativa: fd.get("ativa") === "on",
    };
    const { error } = id
      ? await supabase.from("instituicoes").update(dados).eq("id", id)
      : await supabase.from("instituicoes").insert(dados);
    if (error) throw error;
    revalidatePath("/painel/instituicoes");
    return { ok: id ? "Instituição atualizada." : "Instituição cadastrada." };
  });
}

export async function excluirInstituicao(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("instituicoes").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/instituicoes");
  });
}

export async function salvarSemestre(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const inicio = campoObrigatorio(fd, "inicio", "Início");
    const fim = campoObrigatorio(fd, "fim", "Fim");
    if (fim < inicio) throw new ErroValidacao("O fim do semestre precisa ser depois do início.");
    const instituicao_id = campoObrigatorio(fd, "instituicao_id", "Instituição");
    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("semestres")
      .insert({ instituicao_id, nome: campoObrigatorio(fd, "nome", "Nome"), inicio, fim });
    if (error) throw error;
    revalidatePath(`/painel/instituicoes/${instituicao_id}`);
    return { ok: "Semestre adicionado." };
  });
}

export async function excluirSemestre(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("semestres").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/instituicoes", "layout");
  });
}

/**
 * Adiciona um dia (ou um intervalo de dias) ao calendário.
 * Sem instituição = vale para todos (feriado/recesso geral).
 */
export async function salvarDiaCalendario(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const inicio = campoObrigatorio(fd, "data", "Data");
    const ate = campo(fd, "ate") ?? inicio;
    if (ate < inicio) throw new ErroValidacao("A data final precisa ser depois da inicial.");
    const instituicao_id = campo(fd, "instituicao_id");
    const tipo = campoObrigatorio(fd, "tipo", "Tipo");
    const descricao = campoObrigatorio(fd, "descricao", "Descrição");

    const linhas = [];
    for (let d = new Date(inicio + "T12:00:00Z"); d <= new Date(ate + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      linhas.push({ instituicao_id, data: d.toISOString().slice(0, 10), tipo, descricao });
      if (linhas.length > 120) throw new ErroValidacao("Intervalo muito grande (máximo 120 dias).");
    }

    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("calendario")
      .upsert(linhas, { onConflict: "instituicao_id,data" });
    if (error) throw error;
    revalidatePath("/painel/calendario");
    if (instituicao_id) revalidatePath(`/painel/instituicoes/${instituicao_id}`);
    return { ok: linhas.length > 1 ? `${linhas.length} dias adicionados.` : "Dia adicionado." };
  });
}

export async function excluirDiaCalendario(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("calendario").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/calendario");
    revalidatePath("/painel/instituicoes", "layout");
  });
}
