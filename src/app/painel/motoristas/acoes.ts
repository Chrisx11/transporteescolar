"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { campo, campoObrigatorio, executar, type Estado } from "@/lib/acoes";
import { atualizarUsuario, criarUsuario, definirAtivo, redefinirSenhaProvisoria } from "@/lib/usuarios";

function dadosCnh(fd: FormData) {
  return {
    cnh_numero: campo(fd, "cnh_numero"),
    cnh_categoria: (campo(fd, "cnh_categoria") ?? "D").toUpperCase(),
    cnh_validade: campo(fd, "cnh_validade"),
  };
}

export async function salvarMotorista(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campo(fd, "id");
    const contato = {
      nome: campoObrigatorio(fd, "nome", "Nome"),
      email: campo(fd, "email"),
      telefone: campo(fd, "telefone"),
    };

    if (id) {
      await atualizarUsuario(id, contato);
      const { error } = await supabase.from("motoristas").update(dadosCnh(fd)).eq("usuario_id", id);
      if (error) throw error;
      revalidatePath("/painel/motoristas");
      return { ok: "Motorista atualizado." };
    }

    const novo = await criarUsuario({ ...contato, cpf: campoObrigatorio(fd, "cpf", "CPF"), perfil: "motorista" });
    const { error } = await supabase.from("motoristas").insert({ usuario_id: novo.id, ...dadosCnh(fd) });
    if (error) {
      await criarClienteAdmin().auth.admin.deleteUser(novo.id);
      throw error;
    }
    revalidatePath("/painel/motoristas");
    return { ok: `Motorista cadastrado. Senha provisória: ${novo.senha} — anote e entregue ao motorista.` };
  });
}

export async function novaSenhaMotorista(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const senha = await redefinirSenhaProvisoria(campoObrigatorio(fd, "id", "id"));
    return { ok: `Nova senha provisória: ${senha}` };
  });
}

export async function alternarMotorista(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    await definirAtivo(campoObrigatorio(fd, "id", "id"), fd.get("ativo") === "true");
    revalidatePath("/painel/motoristas");
  });
}
