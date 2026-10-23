"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";
import { atualizarUsuario, criarUsuario, definirAtivo, redefinirSenhaProvisoria } from "@/lib/usuarios";
import type { Perfil } from "@/lib/rotulos";

const PERFIS_EQUIPE: Perfil[] = ["semeduc", "semtransp", "admin"];

export async function salvarUsuarioEquipe(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("admin");
    const id = campo(fd, "id");
    const contato = {
      nome: campoObrigatorio(fd, "nome", "Nome"),
      email: campo(fd, "email"),
      telefone: campo(fd, "telefone"),
    };
    if (id) {
      await atualizarUsuario(id, contato);
      revalidatePath("/painel/usuarios");
      return { ok: "Usuário atualizado." };
    }
    const perfil = campoObrigatorio(fd, "perfil", "Perfil") as Perfil;
    if (!PERFIS_EQUIPE.includes(perfil)) throw new ErroValidacao("Perfil inválido.");
    const novo = await criarUsuario({ ...contato, cpf: campoObrigatorio(fd, "cpf", "CPF"), perfil });
    revalidatePath("/painel/usuarios");
    return { ok: `Usuário criado. Senha provisória: ${novo.senha}` };
  });
}

export async function novaSenhaEquipe(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("admin");
    const senha = await redefinirSenhaProvisoria(campoObrigatorio(fd, "id", "id"));
    return { ok: `Nova senha provisória: ${senha}` };
  });
}

export async function alternarEquipe(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    const sessao = await sessaoComPerfil("admin");
    const id = campoObrigatorio(fd, "id", "id");
    if (id === sessao.id) throw new ErroValidacao("Você não pode bloquear o próprio acesso.");
    await definirAtivo(id, fd.get("ativo") === "true");
    revalidatePath("/painel/usuarios");
  });
}
