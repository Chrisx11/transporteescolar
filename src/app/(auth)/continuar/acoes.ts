"use server";

import { headers } from "next/headers";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { novoCodigo } from "@/lib/codigo-link";
import { telefonePadrao } from "@/lib/formatos";

/**
 * /continuar: o aluno importado das planilhas informa o e-mail ou o telefone
 * e recebe na hora o acesso ao formulário de complemento (/completar/<código>).
 * Proteções: só o primeiro nome aparece; buscas sem resultado são limitadas
 * por conexão; a aprovação depende da conferência do documento pela Educação.
 */

type Resposta =
  | { ok: true; codigo: string; primeiroNome: string }
  | { ok: false; erro: string; dica?: "cadastro" | "primeiro-acesso" };

const MAX_FALHAS = 10;
const JANELA_MIN = 15;
// As buscas sem resultado ficam registradas na tabela de tentativas de login, com este marcador no lugar do CPF.
const MARCADOR = "00000000000";

export async function buscarPedido(identificador: string): Promise<Resposta> {
  try {
    const admin = criarClienteAdmin();
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    if (ip) {
      const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString();
      const { count } = await admin
        .from("tentativas_login")
        .select("id", { count: "exact", head: true })
        .eq("cpf", MARCADOR)
        .eq("ip", ip)
        .eq("sucesso", false)
        .gte("criado_em", desde);
      if ((count ?? 0) >= MAX_FALHAS) return { ok: false, erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` };
    }
    const falhou = async (r: Resposta) => {
      await admin.from("tentativas_login").insert({ cpf: MARCADOR, ip, sucesso: false });
      return r;
    };

    const texto = (identificador ?? "").trim();
    const porEmail = texto.includes("@");
    if (porEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) : texto.replace(/\D/g, "").length < 10) {
      return { ok: false, erro: "Digite o e-mail ou o telefone com DDD que você usou na inscrição." };
    }
    const valor = porEmail ? texto.toLowerCase() : telefonePadrao(texto);
    const { data: achados } = await admin
      .from("pre_cadastros")
      .select("id, nome, status")
      .eq(porEmail ? "email" : "telefone", valor)
      .in("status", ["aguardando", "pendente", "aprovado"])
      .order("criado_em", { ascending: false })
      .limit(5);

    const aguardando = (achados ?? []).filter((p) => p.status === "aguardando");
    if (aguardando.length > 1) {
      return { ok: false, erro: "Há mais de um cadastro com este telefone. Digite o seu e-mail para continuar." };
    }
    if (aguardando.length === 1) {
      const p = aguardando[0];
      // Gera um acesso novo (um link enviado antes para este aluno deixa de valer).
      const c = novoCodigo();
      const { error } = await admin
        .from("pre_cadastros")
        .update({ codigo_hash: c.hash, codigo_expira_em: c.expiraEm })
        .eq("id", p.id)
        .eq("status", "aguardando");
      if (error) return { ok: false, erro: "Não foi possível abrir seu cadastro. Tente de novo." };
      const primeiro = (p.nome ?? "").split(/\s+/)[0] ?? "";
      return {
        ok: true,
        codigo: c.codigo,
        primeiroNome: primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR"),
      };
    }
    if ((achados ?? []).some((p) => p.status === "pendente")) {
      return { ok: false, erro: "Seu cadastro já foi enviado e está em análise pela Secretaria de Educação. Aguarde a aprovação." };
    }
    if ((achados ?? []).some((p) => p.status === "aprovado")) {
      return { ok: false, erro: "Seu cadastro já foi aprovado.", dica: "primeiro-acesso" };
    }
    return falhou({
      ok: false,
      erro: `Não encontramos cadastro com este ${porEmail ? "e-mail" : "telefone"}. Confira o que digitou ou faça um cadastro novo.`,
      dica: "cadastro",
    });
  } catch {
    return { ok: false, erro: "Não foi possível buscar agora. Tente de novo." };
  }
}
