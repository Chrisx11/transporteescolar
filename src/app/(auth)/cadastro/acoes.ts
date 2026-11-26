"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { cpfAceito, limparCpf } from "@/lib/cpf";

/**
 * Pré-cadastro público (sem login). Os arquivos vão direto do celular para o
 * bucket privado "documentos" com links de envio assinados (sem passar pela
 * Vercel, que limita o tamanho). Depois o pedido é gravado pela chave de serviço.
 */

export type Campo = "cpf" | "comprovante" | "residencia" | "foto";
export type Envio = { campo: Campo; path: string; token: string };
type Resposta<T> = ({ ok: true } & T) | { ok: false; erro: string };

const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_MB = 10;
const MAX_POR_HORA = 5;
const PASTA = "pre-cadastro";

async function ipDoPedido() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Prepara o envio dos arquivos: confere tipo e tamanho e devolve um link assinado para cada um. */
export async function iniciarEnvio(
  arquivos: { campo: Campo; tipo: string; tamanho: number }[],
): Promise<Resposta<{ id: string; envios: Envio[] }>> {
  try {
    const admin = criarClienteAdmin();
    const ip = await ipDoPedido();
    if (ip) {
      const umaHora = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await admin.from("pre_cadastros").select("id", { count: "exact", head: true }).eq("ip", ip).gte("criado_em", umaHora);
      if ((count ?? 0) >= MAX_POR_HORA) return { ok: false, erro: "Muitos cadastros enviados daqui. Tente de novo mais tarde." };
    }
    const id = randomUUID();
    const envios: Envio[] = [];
    for (const a of arquivos) {
      if (!["cpf", "comprovante", "residencia", "foto"].includes(a.campo)) return { ok: false, erro: "Arquivo inválido." };
      const ext = TIPOS[a.tipo];
      if (!ext || (a.campo === "foto" && ext === "pdf")) {
        return { ok: false, erro: a.campo === "foto" ? "A foto precisa ser JPG, PNG ou WEBP." : "Envie PDF ou foto (JPG, PNG ou WEBP)." };
      }
      if (a.tamanho > MAX_MB * 1024 * 1024) return { ok: false, erro: `Cada arquivo pode ter até ${MAX_MB} MB.` };
      const path = `${PASTA}/${id}/${a.campo}.${ext}`;
      const { data, error } = await admin.storage.from("documentos").createSignedUploadUrl(path);
      if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
      envios.push({ campo: a.campo, path, token: data.token });
    }
    return { ok: true, id, envios };
  } catch {
    return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
  }
}

export type DadosCadastro = {
  nome: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  endereco: string;
  bairro: string;
  cidade: string;
  instituicao_id: string;
  instituicao_outra: string;
  curso: string;
  periodo: string;
  turno: string;
  aceite: boolean;
};

/** Grava o pedido depois que os arquivos foram enviados. */
export async function concluirCadastro(id: string, d: DadosCadastro): Promise<Resposta<object>> {
  try {
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, erro: "Envio inválido. Recomece o cadastro." };
    const texto = (v: string) => (v ?? "").trim();
    const cpf = limparCpf(d.cpf);
    if (!texto(d.nome) || texto(d.nome).split(/\s+/).length < 2) return { ok: false, erro: "Escreva o nome completo." };
    if (!cpfAceito(cpf)) return { ok: false, erro: "CPF inválido. Confira os números." };
    if (texto(d.telefone).replace(/\D/g, "").length < 10) return { ok: false, erro: "Informe o WhatsApp com DDD." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(d.email))) return { ok: false, erro: "Informe um e-mail válido." };
    if (!["campos", "itaperuna"].includes(d.cidade)) return { ok: false, erro: "Escolha a cidade da faculdade." };
    if (!texto(d.instituicao_id) && !texto(d.instituicao_outra)) return { ok: false, erro: "Escolha ou escreva a instituição." };
    if (!texto(d.curso)) return { ok: false, erro: "Informe o curso." };
    if (!["manha", "tarde", "noite", "integral"].includes(d.turno)) return { ok: false, erro: "Escolha o turno." };
    if (!d.aceite) return { ok: false, erro: "Para enviar, aceite o uso dos seus dados para o cadastro do transporte." };

    const admin = criarClienteAdmin();
    const [{ data: existente }, { data: pendente }, { data: arquivos }] = await Promise.all([
      admin.from("usuarios").select("id").eq("cpf", cpf).maybeSingle(),
      admin.from("pre_cadastros").select("id").eq("cpf", cpf).eq("status", "pendente").maybeSingle(),
      admin.storage.from("documentos").list(`${PASTA}/${id}`),
    ]);
    if (existente) return { ok: false, erro: "Este CPF já tem cadastro no transporte. Entre pela página do aluno ou procure a Secretaria de Educação." };
    if (pendente) return { ok: false, erro: "Já existe um cadastro deste CPF esperando análise. Aguarde o contato da Secretaria de Educação." };

    const nomes = (arquivos ?? []).map((a) => a.name);
    const achar = (campo: Campo) => nomes.find((n) => n.startsWith(`${campo}.`));
    const cpfArq = achar("cpf");
    const compArq = achar("comprovante");
    const residArq = achar("residencia");
    const fotoArq = achar("foto");
    if (!cpfArq) return { ok: false, erro: "Envie o arquivo do CPF." };
    if (!compArq) return { ok: false, erro: "Envie o comprovante da instituição." };
    if (!residArq) return { ok: false, erro: "Envie o comprovante de residência." };

    const { error } = await admin.from("pre_cadastros").insert({
      id,
      nome: texto(d.nome),
      cpf,
      data_nascimento: texto(d.data_nascimento) || null,
      telefone: texto(d.telefone),
      email: texto(d.email).toLowerCase(),
      endereco: texto(d.endereco) || null,
      bairro: texto(d.bairro) || null,
      cidade: d.cidade,
      instituicao_id: texto(d.instituicao_id) || null,
      instituicao_outra: texto(d.instituicao_id) ? null : texto(d.instituicao_outra),
      curso: texto(d.curso),
      periodo: texto(d.periodo) || null,
      turno: d.turno,
      cpf_path: `${PASTA}/${id}/${cpfArq}`,
      comprovante_path: `${PASTA}/${id}/${compArq}`,
      residencia_path: `${PASTA}/${id}/${residArq}`,
      foto_path: fotoArq ? `${PASTA}/${id}/${fotoArq}` : null,
      ip: await ipDoPedido(),
    });
    if (error) return { ok: false, erro: "Não foi possível enviar o cadastro. Tente de novo." };
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível enviar o cadastro. Tente de novo." };
  }
}
