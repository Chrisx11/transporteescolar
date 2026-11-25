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
 * Formulário único da tela do aluno: dados, situação, matrícula, pontos e rotas liberadas.
 * A instituição de cada viagem (dias sem aula) vem do curso do aluno na cidade dela,
 * calculada no banco (instituicao_do_aluno).
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

    // Rotas liberadas (idas e voltas marcadas). Substituem a grade semanal antiga do aluno.
    if (fd.has("rotas_enviadas")) {
      const escolhidas = [...new Set(fd.getAll("viagens").map(String).filter(Boolean))];
      const { error: e2 } = await supabase.from("aluno_viagens").delete().eq("aluno_id", id);
      if (e2) throw e2;
      if (escolhidas.length) {
        const { error: e3 } = await supabase
          .from("aluno_viagens")
          .insert(escolhidas.map((viagem_modelo_id) => ({ aluno_id: id, viagem_modelo_id })));
        if (e3) throw e3;
      }
      const { error: e4 } = await supabase.from("grade_semanal").delete().eq("aluno_id", id);
      if (e4) throw e4;
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
