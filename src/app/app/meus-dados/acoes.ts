"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { emailInterno } from "@/lib/rotulos";
import { telefonePadrao } from "@/lib/formatos";

/**
 * "Meus dados" do aluno: ele muda só telefone, e-mail e foto. Nome e CPF ficam
 * com a Secretaria de Educação. A gravação usa a chave de serviço, mas sempre no
 * próprio cadastro de quem está logado e só nesses campos.
 */

type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_FOTO_MB = 5;

async function alunoLogado() {
  const sessao = await sessaoComPerfil("aluno");
  // O Admin vendo a área do aluno não tem cadastro de aluno (e o e-mail dele é o login da Administração).
  if (sessao.admin) throw new Error("O Admin não altera dados por esta tela.");
  return sessao;
}

export async function salvarContato(dados: { telefone: string; email: string }): Promise<Resultado> {
  try {
    const sessao = await alunoLogado();
    const digitos = dados.telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11) return { ok: false, erro: "Digite o telefone com DDD, por exemplo (22) 99999-9999." };
    const telefone = telefonePadrao(dados.telefone);
    const email = dados.email.trim().toLowerCase() || null;
    if (email && !EMAIL.test(email)) return { ok: false, erro: "Confira o e-mail (ex.: nome@gmail.com)." };

    const admin = criarClienteAdmin();
    if (email !== (sessao.email ?? null)) {
      if (email) {
        const { data: outro } = await admin.from("usuarios").select("id").eq("email", email).neq("id", sessao.id).maybeSingle();
        if (outro) return { ok: false, erro: "Este e-mail já é usado por outro cadastro." };
      }
      // O e-mail também é o login no Supabase Auth (sem e-mail, usa o interno <cpf>@login.italva.invalid).
      const { error } = await admin.auth.admin.updateUserById(sessao.id, { email: email ?? emailInterno(sessao.cpf), email_confirm: true });
      if (error) {
        return {
          ok: false,
          erro: error.message.toLowerCase().includes("already") ? "Este e-mail já é usado por outro cadastro." : "Não foi possível trocar o e-mail. Tente de novo.",
        };
      }
    }
    const { error } = await admin.from("usuarios").update({ telefone, email }).eq("id", sessao.id).eq("perfil", "aluno");
    if (error) return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
    revalidatePath("/app/meus-dados");
    return { ok: true, mensagem: "Dados atualizados." };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Prepara o envio da foto direto ao Storage (bucket privado "fotos", pasta do aluno). */
export async function iniciarEnvioFoto(tipo: string, tamanho: number): Promise<{ ok: true; path: string; token: string } | { ok: false; erro: string }> {
  try {
    const sessao = await alunoLogado();
    const ext = TIPOS_FOTO[tipo];
    if (!ext) return { ok: false, erro: "A foto precisa ser JPG, PNG ou WEBP." };
    if (tamanho > MAX_FOTO_MB * 1024 * 1024) return { ok: false, erro: `A foto pode ter até ${MAX_FOTO_MB} MB.` };
    const path = `${sessao.id}/foto-${Date.now()}.${ext}`;
    const { data, error } = await criarClienteAdmin().storage.from("fotos").createSignedUploadUrl(path);
    if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
    return { ok: true, path, token: data.token };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Grava a foto enviada e apaga a anterior. */
export async function salvarFoto(path: string): Promise<Resultado> {
  try {
    const sessao = await alunoLogado();
    if (!path.startsWith(`${sessao.id}/foto-`) || path.includes("..")) return { ok: false, erro: "Arquivo inválido." };
    const admin = criarClienteAdmin();
    const { data: atual } = await admin.from("alunos").select("foto_path").eq("usuario_id", sessao.id).single();
    const { error } = await admin.from("alunos").update({ foto_path: path }).eq("usuario_id", sessao.id);
    if (error) return { ok: false, erro: "Não foi possível salvar a foto. Tente de novo." };
    if (atual?.foto_path && atual.foto_path !== path) await admin.storage.from("fotos").remove([atual.foto_path]);
    revalidatePath("/app/meus-dados");
    return { ok: true, mensagem: "Foto atualizada." };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
