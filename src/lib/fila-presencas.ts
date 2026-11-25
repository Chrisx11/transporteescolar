"use client";

/**
 * Fila de presenças manuais feitas sem internet (seção 7.4).
 * Fica salva no celular e é enviada quando o sinal volta. Cada item tem um
 * id_offline: reenviar o mesmo item não duplica a presença no servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PresencaPendente = {
  id_offline: string;
  reserva_id: string;
  motivo: string;
  registrado_em: string;
  vdo: string;
};

const CHAVE = "fila-presencas-v1";

function ler(): PresencaPendente[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as PresencaPendente[];
  } catch {
    return [];
  }
}

function gravar(lista: PresencaPendente[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Armazenamento cheio ou bloqueado: a presença segue só na tela até enviar.
  }
}

export function pendentes(vdo?: string): PresencaPendente[] {
  const lista = ler();
  return vdo ? lista.filter((p) => p.vdo === vdo) : lista;
}

export function enfileirar(item: Omit<PresencaPendente, "id_offline" | "registrado_em">): PresencaPendente {
  const novo: PresencaPendente = {
    ...item,
    id_offline: `${item.reserva_id}:${crypto.randomUUID()}`,
    registrado_em: new Date().toISOString(),
  };
  gravar([...ler(), novo]);
  return novo;
}

/**
 * Envia o que estiver na fila. Erros de rede deixam o item na fila; erros de
 * regra (ex.: reserva cancelada) tiram o item e são devolvidos para mostrar.
 */
export async function enviarFila(supabase: SupabaseClient): Promise<{ enviados: number; recusados: string[] }> {
  let enviados = 0;
  const recusados: string[] = [];
  for (const p of ler()) {
    const { error } = await supabase.rpc("marcar_presenca_manual", {
      p_reserva: p.reserva_id,
      p_motivo: p.motivo,
      p_id_offline: p.id_offline,
      p_registrado_em: p.registrado_em,
    });
    if (error && !error.code) break; // sem conexão: tenta depois
    if (error && error.message?.toLowerCase().includes("fetch")) break;
    gravar(ler().filter((x) => x.id_offline !== p.id_offline));
    if (error) recusados.push(error.message);
    else enviados++;
  }
  return { enviados, recusados };
}
