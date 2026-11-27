import type { Metadata } from "next";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSP, somarDias } from "@/lib/tempo";
import { TelaTrocaHorario, type Modelo, type Pedido } from "./tela-troca-horario";

export const metadata: Metadata = { title: "Trocar horário" };

/** Exceção de data (RN19): o aluno pede outra ida/volta para um dia específico. */
export default async function PaginaTrocaHorario() {
  const sessao = await exigirPerfil("aluno");
  const supabase = await criarClienteServidor();
  const [{ data: modelos }, { data: pedidos }, { data: p }] = await Promise.all([
    supabase
      .from("viagens_modelo")
      .select("id, nome, cidade, sentido, hora_saida, dias_semana")
      .eq("ativa", true)
      .eq("condicional", false)
      .in("sentido", ["ida", "volta"])
      .order("hora_saida"),
    supabase
      .from("excecoes")
      .select("id, data, motivo, status, resposta, criado_em, ida:viagens_modelo!excecoes_viagem_ida_modelo_id_fkey(nome, cidade, hora_saida), volta:viagens_modelo!excecoes_viagem_volta_modelo_id_fkey(nome, cidade, hora_saida)")
      .eq("aluno_id", sessao.id)
      .order("data", { ascending: false })
      .limit(30),
    supabase.from("parametros").select("valor").eq("chave", "excecao_antecedencia_max_dias").maybeSingle(),
  ]);
  const hoje = hojeSP();
  return (
    <TelaTrocaHorario
      modelos={(modelos ?? []) as Modelo[]}
      pedidos={(pedidos ?? []) as unknown as Pedido[]}
      hoje={hoje}
      maximo={somarDias(hoje, Number(p?.valor ?? 60))}
    />
  );
}
