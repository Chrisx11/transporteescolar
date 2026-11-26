"use server";

import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cpfAceito, limparCpf } from "@/lib/cpf";
import { pedidoDoCodigo } from "./pedido";
import type { Campo, Envio } from "../cadastro/acoes";

/**
 * Link individual (/completar/<código>) para o aluno importado da planilha
 * completar o pedido de passe: CPF e documentos. Sem login; o código secreto
 * identifica o pedido. Ao concluir, o pedido vai para análise da Educação.
 */

type Resposta<T> = ({ ok: true } & T) | { ok: false; erro: string };
const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_MB = 10;
const PASTA = "pre-cadastro";
const LINK_INVALIDO = "Este link não vale mais. Procure a Secretaria de Educação para receber um novo.";

export async function iniciarEnvioCodigo(
  codigo: string,
  arquivos: { campo: Campo; tipo: string; tamanho: number }[],
): Promise<Resposta<{ envios: Envio[] }>> {
  try {
    const pedido = await pedidoDoCodigo(codigo);
    if (!pedido) return { ok: false, erro: LINK_INVALIDO };
    const admin = criarClienteAdmin();
    const envios: Envio[] = [];
    for (const a of arquivos) {
      if (!["cpf", "comprovante", "residencia", "foto"].includes(a.campo)) return { ok: false, erro: "Arquivo inválido." };
      const ext = TIPOS[a.tipo];
      if (!ext || (a.campo === "foto" && ext === "pdf")) {
        return { ok: false, erro: a.campo === "foto" ? "A foto precisa ser JPG, PNG ou WEBP." : "Envie PDF ou foto (JPG, PNG ou WEBP)." };
      }
      if (a.tamanho > MAX_MB * 1024 * 1024) return { ok: false, erro: `Cada arquivo pode ter até ${MAX_MB} MB.` };
      const path = `${PASTA}/${pedido.id}/${a.campo}.${ext}`;
      const { data, error } = await admin.storage.from("documentos").createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
      envios.push({ campo: a.campo, path, token: data.token });
    }
    return { ok: true, envios };
  } catch {
    return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
  }
}

export type DadosComplemento = {
  cpf: string;
  data_nascimento: string;
  endereco: string;
  bairro: string;
  aceite: boolean;
};

export async function concluirComplemento(codigo: string, d: DadosComplemento): Promise<Resposta<object>> {
  try {
    const pedido = await pedidoDoCodigo(codigo);
    if (!pedido) return { ok: false, erro: LINK_INVALIDO };
    const cpf = limparCpf(d.cpf);
    if (!cpfAceito(cpf)) return { ok: false, erro: "CPF inválido. Confira os números." };
    if (!(d.endereco ?? "").trim()) return { ok: false, erro: "Informe o endereço." };
    if (!d.aceite) return { ok: false, erro: "Para enviar, aceite o uso dos seus dados para o cadastro do transporte." };

    const admin = criarClienteAdmin();
    const [{ data: existente }, { data: outro }, { data: arquivos }] = await Promise.all([
      admin.from("usuarios").select("id").eq("cpf", cpf).maybeSingle(),
      admin.from("pre_cadastros").select("id").eq("cpf", cpf).eq("status", "pendente").neq("id", pedido.id).maybeSingle(),
      admin.storage.from("documentos").list(`${PASTA}/${pedido.id}`),
    ]);
    if (existente) return { ok: false, erro: "Este CPF já tem cadastro no transporte. Entre pela página do aluno ou procure a Secretaria de Educação." };
    if (outro) return { ok: false, erro: "Já existe um pedido deste CPF esperando análise." };

    const nomes = (arquivos ?? []).map((a) => a.name);
    const achar = (campo: Campo) => nomes.find((n) => n.startsWith(`${campo}.`));
    const cpfArq = achar("cpf");
    const compArq = achar("comprovante");
    const residArq = achar("residencia");
    const fotoArq = achar("foto");
    if (!cpfArq) return { ok: false, erro: "Envie o arquivo do CPF." };
    if (!compArq) return { ok: false, erro: "Envie o comprovante de matrícula." };
    if (!residArq) return { ok: false, erro: "Envie o comprovante de residência." };

    const { error } = await admin
      .from("pre_cadastros")
      .update({
        status: "pendente",
        cpf,
        data_nascimento: (d.data_nascimento ?? "").trim() || pedido.data_nascimento,
        endereco: d.endereco.trim(),
        bairro: (d.bairro ?? "").trim() || null,
        cpf_path: `${PASTA}/${pedido.id}/${cpfArq}`,
        comprovante_path: `${PASTA}/${pedido.id}/${compArq}`,
        residencia_path: `${PASTA}/${pedido.id}/${residArq}`,
        foto_path: fotoArq ? `${PASTA}/${pedido.id}/${fotoArq}` : null,
        // O link deixa de valer depois de usado.
        codigo_hash: null,
        codigo_expira_em: null,
      })
      .eq("id", pedido.id)
      .eq("status", "aguardando");
    if (error) return { ok: false, erro: "Não foi possível enviar. Tente de novo." };
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível enviar. Tente de novo." };
  }
}
