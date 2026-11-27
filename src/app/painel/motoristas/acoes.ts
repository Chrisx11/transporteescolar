"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, executar, type Estado } from "@/lib/acoes";
import { telefonePadrao } from "@/lib/formatos";

/**
 * A SEMTRANSP só completa os dados de trabalho do motorista (telefone e CNH).
 * Login, senha e bloqueio de acesso ficam com o Admin (Usuários e senhas).
 */
export async function salvarMotorista(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campoObrigatorio(fd, "id", "Motorista");
    const telefone = campo(fd, "telefone");
    const { data, error: e1 } = await supabase
      .from("usuarios")
      .update({ telefone: telefone ? telefonePadrao(telefone) : null })
      .eq("id", id)
      .eq("perfil", "motorista")
      .select("id");
    if (e1) throw e1;
    if (!data?.length) throw new Error("Motorista não encontrado.");
    const { error } = await supabase
      .from("motoristas")
      .update({
        cnh_numero: campo(fd, "cnh_numero"),
        cnh_categoria: (campo(fd, "cnh_categoria") ?? "D").toUpperCase(),
        cnh_validade: campo(fd, "cnh_validade"),
      })
      .eq("usuario_id", id);
    if (error) throw error;
    revalidatePath("/painel/motoristas");
    return { ok: "Motorista atualizado." };
  });
}
