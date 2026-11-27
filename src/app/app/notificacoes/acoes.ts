"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { chavesVapid } from "@/lib/push";

/**
 * Inscrição do celular para receber notificações. A gravação usa a chave de
 * serviço porque o mesmo celular pode ter sido de outra pessoa antes (troca
 * de login): a inscrição passa a ser de quem está logado agora.
 */

type Resultado = { ok: true } | { ok: false; erro: string };

const logado = () => sessaoComPerfil("aluno", "motorista");

export async function chavePublicaPush(): Promise<string> {
  await logado();
  return (await chavesVapid()).publica;
}

export async function salvarInscricao(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, aparelho: string): Promise<Resultado> {
  try {
    const sessao = await logado();
    const { endpoint, keys } = sub;
    if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) return { ok: false, erro: "Inscrição inválida." };
    const { error } = await criarClienteAdmin()
      .from("push_inscricoes")
      .upsert(
        {
          usuario_id: sessao.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          aparelho: aparelho.slice(0, 120),
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) return { ok: false, erro: "Não foi possível ativar. Tente de novo." };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Ao desativar ou sair: este celular deixa de receber as notificações desta conta. */
export async function removerInscricao(endpoint: string): Promise<Resultado> {
  try {
    const sessao = await logado();
    await criarClienteAdmin().from("push_inscricoes").delete().eq("endpoint", endpoint).eq("usuario_id", sessao.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Notificação de teste para o próprio usuário (chega em todos os celulares dele). */
export async function enviarTeste(): Promise<Resultado> {
  try {
    const sessao = await logado();
    const { error } = await criarClienteAdmin()
      .from("notificacoes")
      .insert({
        usuario_id: sessao.id,
        evento: "teste",
        titulo: "Notificações ativadas ✅",
        conteudo: "É assim que os avisos do transporte vão chegar no seu celular.",
      });
    if (error) return { ok: false, erro: "Não foi possível enviar o teste." };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function alterarLembretes(ativo: boolean): Promise<Resultado> {
  try {
    const sessao = await sessaoComPerfil("aluno");
    const { error } = await criarClienteAdmin().from("usuarios").update({ receber_lembretes: ativo }).eq("id", sessao.id);
    if (error) return { ok: false, erro: "Não foi possível salvar." };
    revalidatePath("/app/notificacoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
