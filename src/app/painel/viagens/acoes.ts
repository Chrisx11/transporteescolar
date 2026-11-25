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
    return { ok: id ? "Viagem atualizada." : "Viagem cadastrada." };
  });
}

export async function excluirViagemModelo(_: Estado, fd: FormData): Promise<Estado> {
  return executar(async () => {
    await sessaoComPerfil("semtransp");
    const supabase = await criarClienteServidor();
    const id = campoObrigatorio(fd, "id", "id");

    // As viagens do dia são geradas automaticamente a partir do modelo e bloqueiam a exclusão.
    // Só reservas ATIVAS impedem: as canceladas são apagadas junto com as viagens do dia.
    const { data: geradas, error: e1 } = await supabase.from("viagens_dia").select("id").eq("viagem_modelo_id", id);
    if (e1) throw e1;
    const ids = (geradas ?? []).map((v) => v.id);
    if (ids.length > 0) {
      const { count: ativas, error: e2 } = await supabase
        .from("reservas")
        .select("id", { count: "exact", head: true })
        .in("viagem_dia_id", ids)
        .eq("status", "ativa");
      if (e2) throw e2;
      if (ativas) {
        throw new ErroValidacao(
          `Esta viagem tem ${ativas} reserva(s) ativa(s) de alunos. Cancele as reservas ou desative a viagem em vez de excluir.`,
        );
      }
      const { error: e3 } = await supabase.from("viagens_dia").delete().in("id", ids);
      if (e3) throw e3;
    }

    const { error } = await supabase.from("viagens_modelo").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/painel/viagens");
    revalidatePath("/painel/dia");
    return { ok: "Viagem excluída." };
  });
}
