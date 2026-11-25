"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";
import { atualizarUsuario, criarUsuario, definirAtivo, redefinirSenhaProvisoria } from "@/lib/usuarios";

const caminho = (id: string) => `/painel/alunos/${id}`;

function dadosPessoais(fd: FormData) {
  return {
    data_nascimento: campo(fd, "data_nascimento"),
    endereco: campo(fd, "endereco"),
    bairro: campo(fd, "bairro"),
  };
}

function contato(fd: FormData) {
  return {
    nome: campoObrigatorio(fd, "nome", "Nome"),
    email: campo(fd, "email"),
    telefone: campo(fd, "telefone"),
  };
}

export async function criarAluno(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const novo = await criarUsuario({ ...contato(fd), cpf: campoObrigatorio(fd, "cpf", "CPF"), perfil: "aluno" });
    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("alunos")
      .insert({ usuario_id: novo.id, situacao: "pendente", ...dadosPessoais(fd) });
    if (error) {
      await criarClienteAdmin().auth.admin.deleteUser(novo.id);
      throw error;
    }
    revalidatePath("/painel/alunos");
    return {
      ok: `Aluno cadastrado. Senha provisória: ${novo.senha} — anote e entregue ao aluno.`,
      dados: { id: novo.id },
    };
  });
}

/**
 * Formulário único da tela do aluno: dados, situação, matrícula, pontos e grade.
 * A instituição de cada dia da grade vem dos vínculos (a da cidade da viagem),
 * para valerem os dias sem aula do calendário dela.
 */
export async function salvarAluno(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const id = campoObrigatorio(fd, "id", "id");
    const supabase = await criarClienteServidor();
    const situacao = campoObrigatorio(fd, "situacao", "Situação");
    const validade = campo(fd, "matricula_validade");

    await atualizarUsuario(id, contato(fd));
    const { error: e1 } = await supabase
      .from("alunos")
      .update({
        ...dadosPessoais(fd),
        situacao,
        motivo_devolucao: situacao === "ativo" ? null : campo(fd, "motivo_devolucao"),
        matricula_validade: validade,
        ponto_ida_padrao_id: campo(fd, "ponto_ida_padrao_id"),
      })
      .eq("usuario_id", id);
    if (e1) throw e1;

    // Ponto da volta: um por cidade; o escolhido define a cidade dele.
    const pontoVolta = campo(fd, "ponto_volta_id");
    if (pontoVolta) {
      const { data: p, error } = await supabase.from("pontos").select("cidade").eq("id", pontoVolta).single();
      if (error) throw error;
      const r = await supabase
        .from("aluno_pontos_volta")
        .upsert({ aluno_id: id, cidade: p.cidade, ponto_id: pontoVolta }, { onConflict: "aluno_id,cidade" });
      if (r.error) throw r.error;
    }

    // Grade: só a ida e a volta de cada dia (pontos do dia ficam como estavam).
    const [{ data: viagens }, { data: vinculos }] = await Promise.all([
      supabase.from("viagens_modelo").select("id, cidade"),
      supabase.from("aluno_vinculos").select("instituicao:instituicoes(id, cidade)").eq("aluno_id", id),
    ]);
    const cidadeDe = (v: string | null) => (viagens ?? []).find((x) => x.id === v)?.cidade;
    const instituicaoEm = (cidade?: string) =>
      ((vinculos ?? []) as unknown as { instituicao: { id: string; cidade: string } | null }[]).find(
        (x) => x.instituicao?.cidade === cidade,
      )?.instituicao?.id ?? null;

    const salvar = [];
    const apagar: number[] = [];
    for (let dia = 1; dia <= 7; dia++) {
      if (!fd.has(`ida_${dia}`)) continue;
      const ida = campo(fd, `ida_${dia}`);
      const volta = campo(fd, `volta_${dia}`);
      if (ida || volta) {
        salvar.push({
          aluno_id: id,
          dia_semana: dia,
          viagem_ida_modelo_id: ida,
          viagem_volta_modelo_id: volta,
          instituicao_id: instituicaoEm(cidadeDe(ida) ?? cidadeDe(volta)),
        });
      } else apagar.push(dia);
    }
    if (salvar.length) {
      const { error } = await supabase.from("grade_semanal").upsert(salvar, { onConflict: "aluno_id,dia_semana" });
      if (error) throw error;
    }
    if (apagar.length) {
      const { error } = await supabase.from("grade_semanal").delete().eq("aluno_id", id).in("dia_semana", apagar);
      if (error) throw error;
    }

    revalidatePath(caminho(id));
    revalidatePath("/painel/alunos");
    if (situacao === "ativo" && !validade) {
      return { ok: "Aluno salvo. Atenção: sem a data de validade da matrícula, ele ainda não consegue reservar." };
    }
    return { ok: "Aluno salvo." };
  });
}

/**
 * Registra foto/comprovante já enviados pelo navegador direto ao Storage
 * (o envio direto evita o limite de 4,5 MB por requisição da Vercel).
 */
export async function salvarDocumentos(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const id = campoObrigatorio(fd, "id", "id");
    const supabase = await criarClienteServidor();
    const { data: atual, error: e0 } = await supabase
      .from("alunos")
      .select("foto_path, comprovante_path")
      .eq("usuario_id", id)
      .single();
    if (e0) throw e0;

    // A validade da matrícula agora fica no formulário principal; só muda aqui se vier no envio.
    const mudancas: Record<string, string | null> = fd.has("matricula_validade")
      ? { matricula_validade: campo(fd, "matricula_validade") }
      : {};
    const remover: { bucket: string; path: string }[] = [];
    const doAluno = (p: string) => {
      if (!p.startsWith(`${id}/`) || p.includes("..")) throw new ErroValidacao("Arquivo inválido.");
      return p;
    };

    const foto = campo(fd, "foto_path");
    if (foto) {
      mudancas.foto_path = doAluno(foto);
      if (atual.foto_path && atual.foto_path !== foto) remover.push({ bucket: "fotos", path: atual.foto_path });
    }
    const comp = campo(fd, "comprovante_path");
    if (comp) {
      mudancas.comprovante_path = doAluno(comp);
      if (atual.comprovante_path && atual.comprovante_path !== comp) {
        remover.push({ bucket: "documentos", path: atual.comprovante_path });
      }
    }

    const { error } = await supabase.from("alunos").update(mudancas).eq("usuario_id", id);
    if (error) throw error;
    for (const r of remover) await supabase.storage.from(r.bucket).remove([r.path]);
    revalidatePath(caminho(id));
    return { ok: "Documentos salvos." };
  });
}

export async function adicionarVinculo(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const aluno_id = campoObrigatorio(fd, "aluno_id", "Aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("aluno_vinculos").insert({
      aluno_id,
      instituicao_id: campoObrigatorio(fd, "instituicao_id", "Instituição"),
      curso: campoObrigatorio(fd, "curso", "Curso"),
      periodo: campo(fd, "periodo"),
      turno: campoObrigatorio(fd, "turno", "Turno"),
    });
    if (error) throw error;
    revalidatePath(caminho(aluno_id));
    return { ok: "Vínculo adicionado." };
  });
}

export async function removerVinculo(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("aluno_vinculos").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/alunos", "layout");
  });
}

export async function novaSenhaAluno(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const senha = await redefinirSenhaProvisoria(campoObrigatorio(fd, "id", "id"));
    return { ok: `Nova senha provisória: ${senha}` };
  });
}

export async function alternarAcessoAluno(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semeduc");
    const id = campoObrigatorio(fd, "id", "id");
    await definirAtivo(id, fd.get("ativo") === "true");
    revalidatePath(caminho(id));
  });
}

export async function adicionarAnotacao(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    const sessao = await sessaoComPerfil("semeduc");
    const aluno_id = campoObrigatorio(fd, "aluno_id", "Aluno");
    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("anotacoes_aluno")
      .insert({ aluno_id, texto: campoObrigatorio(fd, "texto", "Anotação"), autor_id: sessao.id });
    if (error) throw error;
    revalidatePath(caminho(aluno_id));
    return { ok: "Anotação registrada." };
  });
}
