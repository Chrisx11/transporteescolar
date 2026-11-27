"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, executar, type Estado } from "@/lib/acoes";

/** A SEMEDUC aprova ou recusa justificativas de falta e pedidos de troca de horário. */
async function analisar(fd: FormData, funcao: "analisar_justificativa" | "analisar_excecao") {
  await sessaoComPerfil("semeduc");
  const supabase = await criarClienteServidor();
  const aprovar = fd.get("aprovar") === "sim";
  const { error } = await supabase.rpc(funcao, {
    p_id: campoObrigatorio(fd, "id", "id"),
    p_aprovar: aprovar,
    p_resposta: campo(fd, "resposta"),
  });
  if (error) throw error;
  revalidatePath("/painel/solicitacoes");
  revalidatePath("/painel/faltas");
  return aprovar;
}

export async function analisarJustificativa(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => ({ ok: (await analisar(fd, "analisar_justificativa")) ? "Falta justificada. O aluno foi avisado." : "Justificativa recusada. O aluno foi avisado." }));
}

export async function analisarExcecao(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => ({ ok: (await analisar(fd, "analisar_excecao")) ? "Troca aprovada. O aluno foi avisado." : "Pedido recusado. O aluno foi avisado." }));
}
