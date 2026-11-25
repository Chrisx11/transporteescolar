import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Cidade, Sentido } from "@/lib/rotulos";
import type { StatusViagem } from "@/lib/viagens";

export type OnibusDoDia = {
  id: string;
  onibus_id: string;
  prefixo: string;
  /** Placa do veículo: é o que aparece na logística. */
  placa: string;
  capacidade: number;
  situacao: string;
  motorista_id: string | null;
  motorista_nome: string | null;
  extra: boolean;
  alocados: number;
  embarcados: number;
  iniciada_em: string | null;
  encerrada_em: string | null;
};

export type ViagemDoDia = {
  id: string;
  nome: string;
  cidade: Cidade;
  sentido: Sentido;
  saida_em: string;
  prazo_em: string | null;
  status: StatusViagem;
  ocorrencia_descricao: string | null;
  alocada_em: string | null;
  onibus: OnibusDoDia[];
  reservas: number;
  capacidade: number;
  semPonto: number;
  semOnibus: number;
  embarcados: number;
  faltas: number;
  naoRetornou: number;
  alertas: { tipo: "erro" | "alerta"; texto: string }[];
};

type LinhaOnibus = {
  id: string;
  viagem_dia_id: string;
  onibus_id: string;
  motorista_id: string | null;
  extra: boolean;
  iniciada_em: string | null;
  encerrada_em: string | null;
  onibus: { prefixo: string; placa: string; capacidade: number; situacao: string } | null;
  motorista: { usuario: { nome: string } | null } | null;
};

/** Viagens de uma data com escala, contagem de reservas e alertas do painel. */
export async function carregarDia(data: string): Promise<ViagemDoDia[]> {
  const supabase = await criarClienteServidor();
  const { data: viagens } = await supabase
    .from("viagens_dia")
    .select("id, nome, cidade, sentido, saida_em, prazo_em, status, ocorrencia_descricao, alocada_em")
    .eq("data", data)
    .order("saida_em");
  const ids = (viagens ?? []).map((v) => v.id);
  if (ids.length === 0) return [];

  const [{ data: escala }, { data: reservas }, { data: freq }] = await Promise.all([
    supabase
      .from("viagem_dia_onibus")
      .select("id, viagem_dia_id, onibus_id, motorista_id, extra, iniciada_em, encerrada_em, onibus(prefixo, placa, capacidade, situacao), motorista:motoristas(usuario:usuarios(nome))")
      .in("viagem_dia_id", ids),
    supabase
      .from("reservas")
      .select("viagem_dia_id, viagem_dia_onibus_id, ponto_id, embarque:embarques(id)")
      .in("viagem_dia_id", ids)
      .eq("status", "ativa"),
    supabase.from("frequencia").select("viagem_dia_id, resultado").in("viagem_dia_id", ids),
  ]);
  const embarcou = (r: { embarque: unknown }) => (Array.isArray(r.embarque) ? r.embarque.length > 0 : !!r.embarque);
  const frequencia = freq ?? [];

  const linhas = (escala ?? []) as unknown as LinhaOnibus[];
  const res = reservas ?? [];

  return (viagens ?? []).map((v) => {
    const daViagem = res.filter((r) => r.viagem_dia_id === v.id);
    const onibus: OnibusDoDia[] = linhas
      .filter((l) => l.viagem_dia_id === v.id)
      .map((l) => ({
        id: l.id,
        onibus_id: l.onibus_id,
        prefixo: l.onibus?.prefixo ?? "?",
        placa: l.onibus?.placa ?? l.onibus?.prefixo ?? "?",
        capacidade: l.onibus?.capacidade ?? 0,
        situacao: l.onibus?.situacao ?? "ativo",
        motorista_id: l.motorista_id,
        motorista_nome: l.motorista?.usuario?.nome ?? null,
        extra: l.extra,
        alocados: daViagem.filter((r) => r.viagem_dia_onibus_id === l.id).length,
        embarcados: daViagem.filter((r) => r.viagem_dia_onibus_id === l.id && embarcou(r)).length,
        iniciada_em: l.iniciada_em,
        encerrada_em: l.encerrada_em,
      }))
      .sort((a, b) => a.prefixo.localeCompare(b.prefixo, "pt-BR", { numeric: true }));

    const capacidade = onibus.reduce((s, o) => s + o.capacidade, 0);
    const semPonto = daViagem.filter((r) => !r.ponto_id).length;
    const semOnibus = daViagem.filter((r) => !r.viagem_dia_onibus_id).length;
    const ativa = v.status !== "cancelada";
    const alertas: ViagemDoDia["alertas"] = [];
    if (ativa) {
      if (onibus.length === 0) alertas.push({ tipo: "erro", texto: "Nenhum ônibus escalado." });
      if (daViagem.length > capacidade && onibus.length > 0) {
        alertas.push({ tipo: "erro", texto: `Excesso: ${daViagem.length - capacidade} aluno(s) além da capacidade.` });
      }
      for (const o of onibus) {
        if (!o.motorista_id) alertas.push({ tipo: "alerta", texto: `Ônibus ${o.placa} sem motorista.` });
        if (o.situacao === "manutencao") alertas.push({ tipo: "erro", texto: `Ônibus ${o.placa} está em manutenção.` });
      }
      if (semPonto > 0) alertas.push({ tipo: "alerta", texto: `${semPonto} aluno(s) sem ponto de embarque.` });
      if (v.status !== "agendada" && semOnibus > 0) {
        alertas.push({ tipo: "alerta", texto: `${semOnibus} aluno(s) sem ônibus. Use “Realocar alunos”.` });
      }
    }

    return {
      ...(v as Omit<ViagemDoDia, "onibus" | "reservas" | "capacidade" | "semPonto" | "semOnibus" | "embarcados" | "faltas" | "naoRetornou" | "alertas">),
      onibus,
      reservas: daViagem.length,
      capacidade,
      semPonto,
      semOnibus,
      embarcados: daViagem.filter(embarcou).length,
      faltas: frequencia.filter((f) => f.viagem_dia_id === v.id && f.resultado === "falta").length,
      naoRetornou: frequencia.filter((f) => f.viagem_dia_id === v.id && f.resultado === "nao_retornou").length,
      alertas,
    };
  });
}
