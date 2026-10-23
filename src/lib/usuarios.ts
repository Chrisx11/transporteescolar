import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cpfValido, limparCpf } from "@/lib/cpf";
import { gerarSenhaProvisoria } from "@/lib/senha";
import { emailInterno, type Perfil } from "@/lib/rotulos";
import { ErroValidacao } from "@/lib/acoes";

export type NovoUsuario = {
  cpf: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  perfil: Perfil;
};

/**
 * Cria o login no Supabase Auth (chave de serviço) e o registro em `usuarios`
 * com a sessão de quem está cadastrando — assim a RLS confere a permissão e a
 * auditoria registra o autor. Retorna o id e a senha provisória.
 */
export async function criarUsuario(dados: NovoUsuario): Promise<{ id: string; senha: string }> {
  const cpf = limparCpf(dados.cpf);
  if (!cpfValido(cpf)) throw new ErroValidacao("CPF inválido. Confira os números.");

  const admin = criarClienteAdmin();
  const { data: existente } = await admin.from("usuarios").select("id").eq("cpf", cpf).maybeSingle();
  if (existente) throw new ErroValidacao("Já existe um cadastro com este CPF.");

  const senha = gerarSenhaProvisoria();
  const email = dados.email?.toLowerCase() ?? null;
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: email ?? emailInterno(cpf),
    password: senha,
    email_confirm: true,
    app_metadata: { perfil: dados.perfil },
  });
  if (erroAuth || !criado.user) {
    if (erroAuth?.message?.toLowerCase().includes("already")) {
      throw new ErroValidacao("Este e-mail já está em uso por outro cadastro.");
    }
    throw new ErroValidacao("Não foi possível criar o login: " + (erroAuth?.message ?? ""));
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("usuarios").insert({
    id: criado.user.id,
    cpf,
    nome: dados.nome,
    email,
    telefone: dados.telefone,
    perfil: dados.perfil,
    troca_senha_obrigatoria: true,
  });
  if (error) {
    await admin.auth.admin.deleteUser(criado.user.id);
    throw error;
  }
  return { id: criado.user.id, senha };
}

/** Atualiza nome/contato. Se o e-mail mudar, atualiza também o login. */
export async function atualizarUsuario(
  id: string,
  dados: { nome: string; email: string | null; telefone: string | null },
) {
  const supabase = await criarClienteServidor();
  const { data: atual, error: e1 } = await supabase
    .from("usuarios")
    .select("cpf, email")
    .eq("id", id)
    .single();
  if (e1) throw e1;

  const email = dados.email?.toLowerCase() ?? null;
  // Primeiro a tabela (a RLS confere a permissão), depois o login no Auth.
  const { data, error } = await supabase
    .from("usuarios")
    .update({ nome: dados.nome, email, telefone: dados.telefone })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new ErroValidacao("Você não tem permissão para alterar este usuário.");

  if (email !== atual.email) {
    const { error: e2 } = await criarClienteAdmin().auth.admin.updateUserById(id, {
      email: email ?? emailInterno(atual.cpf),
      email_confirm: true,
    });
    if (e2) {
      await supabase.from("usuarios").update({ email: atual.email }).eq("id", id);
      throw new ErroValidacao("Não foi possível alterar o e-mail: " + e2.message);
    }
  }
}

/** Gera nova senha provisória e obriga a troca no próximo login. */
export async function redefinirSenhaProvisoria(id: string): Promise<string> {
  const supabase = await criarClienteServidor();
  // A atualização com a sessão de quem pede confirma a permissão (RLS) e audita.
  const { data, error } = await supabase
    .from("usuarios")
    .update({ troca_senha_obrigatoria: true })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new ErroValidacao("Você não tem permissão para alterar este usuário.");

  const senha = gerarSenhaProvisoria();
  const { error: e2 } = await criarClienteAdmin().auth.admin.updateUserById(id, { password: senha });
  if (e2) throw new ErroValidacao("Não foi possível gerar a senha: " + e2.message);
  return senha;
}

/** Ativa/desativa o acesso. Desativado não consegue entrar. */
export async function definirAtivo(id: string, ativo: boolean) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("usuarios").update({ ativo }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new ErroValidacao("Você não tem permissão para alterar este usuário.");
  await criarClienteAdmin().auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
}
