import { notFound } from "next/navigation";
import type { MinhaViagem, PontoOpcao } from "@/lib/viagens";
import { CartaoViagem } from "@/app/app/cartao-viagem";
import { SecaoVoltas } from "@/app/app/secao-voltas";

/** Prévia da tela Hoje do aluno (ida primeiro, volta escolhida junto), só no servidor local (404 em produção). */
export default function PreviaHoje() {
  if (process.env.NODE_ENV === "production") notFound();
  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const em = (h: string) => `${amanha}T${h}:00-03:00`;
  const base = {
    abertura_em: null, status_viagem: "agendada", reserva_id: null, onibus_prefixo: null, ponto_nome: null, motivo: null, mensagem: null,
    pode_cancelar: true, embarcado: false, embarque_de: null, embarque_ate: null, resultado: null,
    ponto_embarque_id: null, ponto_desembarque_id: null, ponto_desembarque_nome: null, cidade: "campos",
  } as const;
  const v = (id: string, sentido: "ida" | "volta", nome: string, saida: string, prazo: string): MinhaViagem =>
    ({ ...base, viagem_dia_id: id, sentido, nome, saida_em: em(saida), prazo_em: em(prazo) }) as MinhaViagem;
  const idas = [v("i1", "ida", "Ida manhã", "05:30", "19:00"), v("i2", "ida", "Ida noite", "16:30", "15:00")];
  const voltas = [v("v1", "volta", "Volta 12:00", "12:00", "10:00"), v("v2", "volta", "Volta tarde", "18:15", "15:00"), v("v3", "volta", "Volta noite", "22:00", "15:00")];
  const pontos: PontoOpcao[] = [
    { id: "p1", nome: "Praça Central", cidade: "italva", ordem: 1, linha: "campos" },
    { id: "p2", nome: "Rodoviária", cidade: "italva", ordem: 2, linha: null },
    { id: "p3", nome: "UENF", cidade: "campos", ordem: 1, linha: "campos" },
    { id: "p4", nome: "IFF Centro", cidade: "campos", ordem: 2, linha: "campos" },
  ];
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 bg-slate-100 p-4">
      {idas.map((i) => (
        <CartaoViagem key={i.viagem_dia_id} v={i} pontos={pontos} voltas={voltas.filter((x) => x.saida_em > i.saida_em)} />
      ))}
      <SecaoVoltas abertaInicial={false} titulo="Volta">
        {voltas.map((x) => (
          <CartaoViagem key={x.viagem_dia_id} v={x} pontos={pontos} />
        ))}
      </SecaoVoltas>
    </main>
  );
}
