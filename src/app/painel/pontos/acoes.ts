"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";

function numeroOuNulo(v: string | null, rotulo: string) {
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) throw new ErroValidacao(`${rotulo} inválida.`);
  return n;
}

export async function salvarPonto(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campo(fd, "id");
    const dados = {
      nome: campoObrigatorio(fd, "nome", "Nome"),
      cidade: campoObrigatorio(fd, "cidade", "Cidade"),
      endereco: campo(fd, "endereco"),
      lat: numeroOuNulo(campo(fd, "lat"), "Latitude"),
      lng: numeroOuNulo(campo(fd, "lng"), "Longitude"),
      ordem: Number(campo(fd, "ordem") ?? 0),
      ativo: fd.get("ativo") === "on",
    };
    const { error } = id
      ? await supabase.from("pontos").update(dados).eq("id", id)
      : await supabase.from("pontos").insert(dados);
    if (error) throw error;
    revalidatePath("/painel/pontos");
    return { ok: id ? "Ponto atualizado." : "Ponto cadastrado." };
  });
}

export async function excluirPonto(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("pontos").delete().eq("id", campoObrigatorio(fd, "id", "id"));
    if (error) throw error;
    revalidatePath("/painel/pontos");
  });
}
