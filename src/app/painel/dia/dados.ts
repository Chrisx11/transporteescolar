import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Cidade, Sentido } from "@/lib/rotulos";
import type { StatusViagem } from "@/lib/viagens";

export type OnibusDoDia = {
  id: string;
  onibus_id: string;
  prefixo: string;
  capacidade: number;
  situacao: string;
  motorista_id: string | null;
  motorista_nome: string | null;
  extra: boolean;
  alocados: number;
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
  alertas: { tipo: "erro" | "alerta"; texto: string }[];
};

type LinhaOnibus = {
  id: string;
  viagem_dia_id: string;
  onibus_id: string;
  motorista_id: string | null;
  extra: boolean;
  onibus: { prefixo: string; capacidade: number; situacao: string } | null;
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

  const [{ data: escala }, { data: reservas }] = await Promise.all([
    supabase
      .from("viagem_dia_onibus")
      .select("id, viagem_dia_id, onibus_id, motorista_id, extra, onibus(prefixo, capacidade, situacao), motorista:motoristas(usuario:usuarios(nome))")
      .in("viagem_dia_id", ids),
    supabase.from("reservas").select("viagem_dia_id, viagem_dia_onibus_id, ponto_id").in("viagem_dia_id", ids).eq("status", "ativa"),
  ]);

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
        capacidade: l.onibus?.capacidade ?? 0,
        situacao: l.onibus?.situacao ?? "ativo",
        motorista_id: l.motorista_id,
        motorista_nome: l.motorista?.usuario?.nome ?? null,
        extra: l.extra,
        alocados: daViagem.filter((r) => r.viagem_dia_onibus_id === l.id).length,
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
        if (!o.motorista_id) alertas.push({ tipo: "alerta", texto: `Ônibus ${o.prefixo} sem motorista.` });
        if (o.situacao === "manutencao") alertas.push({ tipo: "erro", texto: `Ônibus ${o.prefixo} está em manutenção.` });
      }
      if (semPonto > 0) alertas.push({ tipo: "alerta", texto: `${semPonto} aluno(s) sem ponto de embarque.` });
      if (v.status !== "agendada" && semOnibus > 0) {
        alertas.push({ tipo: "alerta", texto: `${semOnibus} aluno(s) sem ônibus. Use “Realocar alunos”.` });
      }
    }

    return {
      ...(v as Omit<ViagemDoDia, "onibus" | "reservas" | "capacidade" | "semPonto" | "semOnibus" | "alertas">),
      onibus,
      reservas: daViagem.length,
      capacidade,
      semPonto,
      semOnibus,
      alertas,
    };
  });
}
