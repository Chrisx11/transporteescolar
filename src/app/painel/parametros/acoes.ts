"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";

export async function salvarParametro(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("admin");
    const chave = campoObrigatorio(fd, "chave", "chave");
    const tipo = campoObrigatorio(fd, "tipo", "tipo");
    let valor: unknown;
    if (tipo === "booleano") {
      valor = fd.get("valor") === "on";
    } else {
      const bruto = campoObrigatorio(fd, "valor", "Valor");
      if (tipo === "numero") {
        valor = Number(bruto.replace(",", "."));
        if (!Number.isFinite(valor) || (valor as number) < 0) throw new ErroValidacao("Informe um número válido.");
      } else if (tipo === "hora") {
        if (!/^\d{2}:\d{2}$/.test(bruto)) throw new ErroValidacao("Informe a hora no formato HH:MM.");
        valor = bruto;
      } else {
        valor = bruto;
      }
    }
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("parametros").update({ valor }).eq("chave", chave);
    if (error) throw error;
    revalidatePath("/painel/parametros");
    return { ok: "Salvo." };
  });
}
