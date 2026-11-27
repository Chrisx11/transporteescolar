"use server";

import { revalidatePath } from "next/cache";
import { sessaoComPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campo, campoObrigatorio, ErroValidacao, executar, type Estado } from "@/lib/acoes";

export async function salvarViagemModelo(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const id = campo(fd, "id");
    const sentido = campoObrigatorio(fd, "sentido", "Sentido");
    const condicional = fd.get("condicional") === "on";
    const semPrazo = sentido === "deslocamento_vazio" || condicional;
    const dias = fd.getAll("dias_semana").map(Number).filter((d) => d >= 1 && d <= 7);
    if (dias.length === 0) throw new ErroValidacao("Marque pelo menos um dia da semana.");

    const km = campo(fd, "km_estimado");
    const kmVazio = campo(fd, "km_retorno_vazio");
    const dados = {
      cidade: campoObrigatorio(fd, "cidade", "Cidade"),
      nome: campoObrigatorio(fd, "nome", "Nome"),
      sentido,
      hora_saida: campoObrigatorio(fd, "hora_saida", "Horário de saída"),
      duracao_min: Number(campoObrigatorio(fd, "duracao_min", "Duração")),
      prazo_tipo: semPrazo ? null : campoObrigatorio(fd, "prazo_tipo", "Tipo de prazo"),
      prazo_hora: semPrazo ? null : campoObrigatorio(fd, "prazo_hora", "Hora do prazo"),
      dias_semana: dias,
      condicional,
      bloqueia_ao_lotar: sentido === "volta" && fd.get("bloqueia_ao_lotar") === "on",
      km_estimado: km === null ? null : Number(km.replace(",", ".")),
      km_retorno_vazio: kmVazio === null ? 0 : Number(kmVazio.replace(",", ".")),
      ativa: fd.get("ativa") === "on",
    };
    if (dados.prazo_tipo === "mesmo_dia" && dados.prazo_hora && dados.prazo_hora >= dados.hora_saida) {
      throw new ErroValidacao("O prazo do mesmo dia precisa ser antes do horário de saída.");
    }

    const supabase = await criarClienteServidor();
    const { error } = id
      ? await supabase.from("viagens_modelo").update(dados).eq("id", id)
      : await supabase.from("viagens_modelo").insert(dados);
    if (error) throw error;
    revalidatePath("/painel/viagens");
    return {
      ok: id
        ? "Viagem atualizada, também nas viagens de hoje e dos próximos dias que ainda não aconteceram."
        : "Viagem cadastrada. As viagens de hoje e dos próximos dias já foram criadas.",
    };
  });
}

export async function excluirViagemModelo(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campoObrigatorio(fd, "id", "id");

    // Fase de testes: exclui tudo o que veio do modelo — viagens do dia, reservas
    // (ativas ou não), embarques e frequência. A grade dos alunos fica sem essa viagem.
    const { data: geradas, error: e1 } = await supabase.from("viagens_dia").select("id").eq("viagem_modelo_id", id);
    if (e1) throw e1;
    const ids = (geradas ?? []).map((v) => v.id);
    let ativas = 0;
    if (ids.length > 0) {
      const { count, error: e2 } = await supabase
        .from("reservas")
        .select("id", { count: "exact", head: true })
        .in("viagem_dia_id", ids)
        .eq("status", "ativa");
      if (e2) throw e2;
      ativas = count ?? 0;
      const { error: e3 } = await supabase.from("viagens_dia").delete().in("id", ids);
      if (e3) throw e3;
    }

    const { error } = await supabase.from("viagens_modelo").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/painel/viagens");
    revalidatePath("/painel/dia");
    revalidatePath("/app");
    return { ok: ativas ? `Viagem excluída, junto com ${ativas} reserva(s) ativa(s).` : "Viagem excluída." };
  });
}
