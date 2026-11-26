"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";
import { criarUsuario } from "@/lib/usuarios";

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

    const novo = await criarUsuario({ nome: p.nome, cpf: p.cpf, email: p.email, telefone: p.telefone, perfil: "aluno" });
    const ext = (path: string) => path.split(".").pop();
    const comprovante = `${novo.id}/comprovante-${Date.now()}.${ext(p.comprovante_path)}`;
    const foto = p.foto_path ? `${novo.id}/foto-${Date.now()}.${ext(p.foto_path)}` : null;
    try {
      await copiar(p.comprovante_path, "documentos", comprovante);
      if (foto) await copiar(p.foto_path, "fotos", foto);
      const { error: e1 } = await supabase.from("alunos").insert({
        usuario_id: novo.id,
        situacao: "ativo",
        matricula_validade: validade,
        data_nascimento: p.data_nascimento,
        endereco: p.endereco,
        bairro: p.bairro,
        comprovante_path: comprovante,
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

    revalidatePath("/painel/pre-cadastros");
    revalidatePath("/painel/alunos");
    return {
      ok: `Cadastro aprovado. Senha provisória: ${novo.senha} — envie ao aluno pelo WhatsApp ${p.telefone}. Depois marque as rotas dele na tela do aluno.`,
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
    const { data: p, error } = await supabase.from("pre_cadastros").select("status, cpf_path, comprovante_path, foto_path").eq("id", id).single();
    if (error) throw error;
    if (p.status !== "pendente") throw new ErroValidacao("Este cadastro já foi analisado.");
    const { error: e1 } = await supabase
      .from("pre_cadastros")
      .update({ status: "recusado", motivo, analisado_por: sessao.id, analisado_em: new Date().toISOString() })
      .eq("id", id);
    if (e1) throw e1;
    await criarClienteAdmin()
      .storage.from("documentos")
      .remove([p.cpf_path, p.comprovante_path, p.foto_path].filter((x): x is string => !!x));
    revalidatePath("/painel/pre-cadastros");
    return { ok: "Cadastro recusado." };
  });
}

