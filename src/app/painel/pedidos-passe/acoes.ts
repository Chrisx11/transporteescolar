"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";
import { criarUsuario } from "@/lib/usuarios";
import { DIAS_VALIDADE_LINK, linkCompletar, novoCodigo } from "@/lib/codigo-link";
import { emailCompletarPedido, emailConfigurado, enviarEmails } from "@/lib/email";

/** Copia um arquivo do pedido para a pasta do aluno (bucket de destino pode ser outro). */
async function copiar(origem: string, bucket: "documentos" | "fotos", destino: string) {
  const admin = criarClienteAdmin();
  const { data, error } = await admin.storage.from("documentos").download(origem);
  if (error || !data) throw new ErroValidacao("Não foi possível copiar um dos documentos. Tente de novo.");
  const { error: e2 } = await admin.storage.from(bucket).upload(destino, data, { contentType: data.type, upsert: true });
  if (e2) throw new ErroValidacao("Não foi possível copiar um dos documentos. Tente de novo.");
}

/** Aprova: cria o login do aluno (ativo), copia comprovante e foto, cria o vínculo e devolve a senha provisória. */
export async function aprovarPreCadastro(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    const sessao = await sessaoComPerfil("semeduc");
    const id = campoObrigatorio(fd, "id", "id");
    const validade = campoObrigatorio(fd, "matricula_validade", "Matrícula válida até");
    const supabase = await criarClienteServidor();
    const { data: p, error } = await supabase.from("pre_cadastros").select("*").eq("id", id).single();
    if (error) throw error;
    if (p.status !== "pendente") throw new ErroValidacao("Este cadastro já foi analisado.");

    // A Educação pode corrigir o e-mail antes de aprovar (ex.: e-mail já usado por outro login).
    const email = (campo(fd, "email") ?? p.email ?? "").trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroValidacao("E-mail inválido.");
    if (email) {
      const { data: emUso } = await criarClienteAdmin().from("usuarios").select("id").eq("email", email).maybeSingle();
      if (emUso) {
        throw new ErroValidacao("Este e-mail já é usado por outro login. Troque o e-mail do aluno no campo acima e aprove de novo.");
      }
    }
    if (email !== p.email) await supabase.from("pre_cadastros").update({ email }).eq("id", id);

    const novo = await criarUsuario({ nome: p.nome, cpf: p.cpf, email, telefone: p.telefone, perfil: "aluno", senhaInicial: "cpf" });
    const ext = (path: string) => path.split(".").pop();
    const comprovante = `${novo.id}/comprovante-${Date.now()}.${ext(p.comprovante_path)}`;
    const foto = p.foto_path ? `${novo.id}/foto-${Date.now()}.${ext(p.foto_path)}` : null;
    const residencia = p.residencia_path ? `${novo.id}/residencia-${Date.now()}.${ext(p.residencia_path)}` : null;
    try {
      await copiar(p.comprovante_path, "documentos", comprovante);
      if (residencia) await copiar(p.residencia_path, "documentos", residencia);
      if (foto) await copiar(p.foto_path, "fotos", foto);
      const { error: e1 } = await supabase.from("alunos").insert({
        usuario_id: novo.id,
        situacao: "ativo",
        matricula_validade: validade,
        data_nascimento: p.data_nascimento,
        endereco: p.endereco,
        bairro: p.bairro,
        comprovante_path: comprovante,
        residencia_path: residencia,
        foto_path: foto,
      });
      if (e1) throw e1;
    } catch (e) {
      await criarClienteAdmin().auth.admin.deleteUser(novo.id);
      throw e;
    }

    if (p.instituicao_id) {
      await supabase
        .from("aluno_vinculos")
        .insert({ aluno_id: novo.id, instituicao_id: p.instituicao_id, curso: p.curso, periodo: p.periodo, turno: p.turno });
    }
    const { error: e3 } = await supabase
      .from("pre_cadastros")
      .update({ status: "aprovado", aluno_id: novo.id, analisado_por: sessao.id, analisado_em: new Date().toISOString() })
      .eq("id", id);
    if (e3) throw e3;

    revalidatePath("/painel/pedidos-passe");
    revalidatePath("/painel/alunos");
    return {
      ok: `Pedido aprovado. O aluno entra pela página /aluno com o CPF e, no primeiro acesso, a senha também é o CPF (só os números); ele cria uma senha nova ao entrar. Avise pelo WhatsApp ${p.telefone} e marque as rotas dele na tela do aluno.`,
      dados: { aluno_id: novo.id },
    };
  });
}

/** Recusa com motivo e apaga os documentos enviados (LGPD: não guardar sem necessidade). */
export async function recusarPreCadastro(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    const sessao = await sessaoComPerfil("semeduc");
    const id = campoObrigatorio(fd, "id", "id");
    const motivo = campoObrigatorio(fd, "motivo", "Motivo");
    const supabase = await criarClienteServidor();
    const { data: p, error } = await supabase.from("pre_cadastros").select("status, cpf_path, comprovante_path, residencia_path, foto_path").eq("id", id).single();
    if (error) throw error;
    if (p.status !== "pendente") throw new ErroValidacao("Este cadastro já foi analisado.");
    const { error: e1 } = await supabase
      .from("pre_cadastros")
      .update({ status: "recusado", motivo, analisado_por: sessao.id, analisado_em: new Date().toISOString() })
      .eq("id", id);
    if (e1) throw e1;
    await criarClienteAdmin()
      .storage.from("documentos")
      .remove([p.cpf_path, p.comprovante_path, p.residencia_path, p.foto_path].filter((x): x is string => !!x));
    revalidatePath("/painel/pedidos-passe");
    return { ok: "Cadastro recusado." };
  });
}


// ---------------------------------------------------------------------
// Pedidos "aguardando complemento" (importados das planilhas): link individual
// ---------------------------------------------------------------------

/** Gera um link novo para o pedido (o anterior deixa de valer) e o devolve para copiar. */
export async function gerarLinkPedido(id: string): Promise<{ ok: true; link: string } | { ok: false; erro: string }> {
  try {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const c = novoCodigo();
    const { data, error } = await supabase
      .from("pre_cadastros")
      .update({ codigo_hash: c.hash, codigo_expira_em: c.expiraEm })
      .eq("id", id)
      .eq("status", "aguardando")
      .select("id");
    if (error || !data?.length) return { ok: false, erro: "Não foi possível gerar o link (o pedido não está aguardando complemento)." };
    return { ok: true, link: linkCompletar(c.codigo) };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

type Aguardando = { id: string; nome: string; email: string | null };

/** Gera links novos e envia por e-mail; registra o resultado de cada pedido. */
async function enviarLinks(pedidos: Aguardando[]) {
  const supabase = await criarClienteServidor();
  const comEmail = pedidos.filter((p) => p.email);
  const preparados: { p: Aguardando; link: string }[] = [];
  for (const p of comEmail) {
    const c = novoCodigo();
    const { error } = await supabase.from("pre_cadastros").update({ codigo_hash: c.hash, codigo_expira_em: c.expiraEm }).eq("id", p.id);
    if (!error) preparados.push({ p, link: linkCompletar(c.codigo) });
  }
  const resultados = await enviarEmails(preparados.map(({ p, link }) => emailCompletarPedido(p.nome, p.email!, link, DIAS_VALIDADE_LINK)));
  let enviados = 0;
  let primeiroErro: string | null = null;
  for (const [i, { p }] of preparados.entries()) {
    const r = resultados[i];
    if (r.ok) enviados++;
    else primeiroErro ??= r.erro;
    await supabase
      .from("pre_cadastros")
      .update(r.ok ? { email_enviado_em: new Date().toISOString(), email_erro: null } : { email_erro: r.erro })
      .eq("id", p.id);
  }
  return { enviados, falhas: preparados.length - enviados, semEmail: pedidos.length - comEmail.length, primeiroErro };
}

export async function enviarLinkPedido(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const { data: p, error } = await supabase
      .from("pre_cadastros")
      .select("id, nome, email")
      .eq("id", campoObrigatorio(fd, "id", "id"))
      .eq("status", "aguardando")
      .single();
    if (error) throw error;
    const r = await enviarLinks([p]);
    revalidatePath("/painel/pedidos-passe");
    if (r.primeiroErro) throw new ErroValidacao(r.primeiroErro);
    return { ok: `Link enviado para ${p.email}.` };
  });
}

/** Envia o link para os pedidos aguardando que ainda não receberam e-mail (até 200 por vez). */
export async function enviarLinksNaoEnviados(): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    if (!emailConfigurado()) throw new ErroValidacao("O envio de e-mail ainda não foi configurado (falta a chave do Resend nas configurações do site).");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from("pre_cadastros")
      .select("id, nome, email")
      .eq("status", "aguardando")
      .is("email_enviado_em", null)
      .order("criado_em")
      .limit(200);
    if (error) throw error;
    if (!data?.length) return { ok: "Todos os pedidos aguardando já receberam o link." };
    const r = await enviarLinks(data);
    revalidatePath("/painel/pedidos-passe");
    const partes = [`${r.enviados} e-mail(s) enviado(s)`];
    if (r.falhas) partes.push(`${r.falhas} com erro (${r.primeiroErro})`);
    if (r.semEmail) partes.push(`${r.semEmail} sem e-mail`);
    return { ok: partes.join(" · ") + "." };
  });
}
