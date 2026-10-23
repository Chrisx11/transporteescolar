import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Bus, ListChecks, MapPin, UserRound } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Cartao, Selecao, Selo, Titulo, Vazio } from "@/components/ui";
import { CIDADES, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { dataBR } from "@/lib/tempo";
import { STATUS_VIAGEM, type StatusViagem } from "@/lib/viagens";
import { TempoReal } from "../tempo-real";
import { moverReserva } from "../acoes";

export const metadata: Metadata = { title: "Alunos da viagem" };

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

type Reserva = {
  id: string;
  viagem_dia_onibus_id: string | null;
  aluno: { usuario: { nome: string; telefone: string | null } | null } | null;
  ponto: { nome: string; ordem: number } | null;
};

/** Lista de alunos de uma viagem do dia, por ônibus, com opção de mover. */
export default async function AlunosDaViagem({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("semtransp");
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: v }, { data: escala }, { data: reservas }] = await Promise.all([
    supabase.from("viagens_dia").select("id, data, nome, cidade, sentido, saida_em, status").eq("id", id).maybeSingle(),
    supabase.from("viagem_dia_onibus").select("id, onibus(prefixo, capacidade)").eq("viagem_dia_id", id),
    supabase
      .from("reservas")
      .select("id, viagem_dia_onibus_id, aluno:alunos(usuario:usuarios(nome, telefone)), ponto:pontos(nome, ordem)")
      .eq("viagem_dia_id", id)
      .eq("status", "ativa"),
  ]);
  if (!v) notFound();

  const onibus = ((escala ?? []) as unknown as { id: string; onibus: { prefixo: string; capacidade: number } | null }[])
    .map((e) => ({ id: e.id, prefixo: e.onibus?.prefixo ?? "?", capacidade: e.onibus?.capacidade ?? 0 }))
    .sort((a, b) => a.prefixo.localeCompare(b.prefixo, "pt-BR", { numeric: true }));
  const lista = ((reservas ?? []) as unknown as Reserva[]).sort(
    (a, b) =>
      (a.ponto?.ordem ?? 999) - (b.ponto?.ordem ?? 999) ||
      (a.aluno?.usuario?.nome ?? "").localeCompare(b.aluno?.usuario?.nome ?? "", "pt-BR"),
  );
  const grupos = [
    ...onibus.map((o) => ({ chave: o.id, titulo: `Ônibus ${o.prefixo}`, capacidade: o.capacidade, itens: lista.filter((r) => r.viagem_dia_onibus_id === o.id) })),
    { chave: "sem", titulo: "Sem ônibus definido", capacidade: 0, itens: lista.filter((r) => !r.viagem_dia_onibus_id) },
  ].filter((g) => g.chave !== "sem" || g.itens.length > 0);
  const status = STATUS_VIAGEM[v.status as StatusViagem];

  return (
    <>
      <Titulo
        icone={ListChecks}
        descricao={`${SENTIDOS[v.sentido as Sentido]} · ${CIDADES[v.cidade as Cidade]} · ${dataBR(v.data)} às ${HORA.format(new Date(v.saida_em))} · ${lista.length} aluno(s)`}
        acoes={
          <>
            <TempoReal />
            <BotaoLink variante="secundario" href={`/painel/dia?data=${v.data}`}>
              <ArrowLeft /> Painel do dia
            </BotaoLink>
          </>
        }
      >
        <span className="flex flex-wrap items-center gap-3">
          {v.nome} <Selo cor={status.cor}>{status.rotulo}</Selo>
        </span>
      </Titulo>

      {lista.length === 0 ? (
        <Vazio icone={UserRound}>Nenhum aluno reservou esta viagem.</Vazio>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          {grupos.map((g) => (
            <Cartao
              key={g.chave}
              icone={Bus}
              titulo={g.titulo}
              acoes={
                g.capacidade > 0 && (
                  <Selo cor={g.itens.length > g.capacidade ? "vermelho" : "cinza"}>
                    {g.itens.length}/{g.capacidade}
                  </Selo>
                )
              }
            >
              {g.itens.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum aluno neste ônibus.</p>
              ) : (
                <ul className="-mx-2 flex flex-col divide-y divide-slate-100">
                  {g.itens.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{r.aluno?.usuario?.nome}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                          <MapPin className="size-3" />
                          {r.ponto?.nome ?? <span className="text-amber-700">sem ponto definido</span>}
                        </p>
                      </div>
                      {onibus.length > 1 && v.status !== "cancelada" && (
                        <Formulario acao={moverReserva} className="flex-row items-center gap-1.5">
                          <input type="hidden" name="reserva_id" value={r.id} />
                          <Selecao name="destino" defaultValue="" required className="w-32 [&_select]:h-8 [&_select]:text-xs" aria-label="Mover para">
                            <option value="" disabled>
                              Mover para…
                            </option>
                            {onibus
                              .filter((o) => o.id !== r.viagem_dia_onibus_id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  Ônibus {o.prefixo}
                                </option>
                              ))}
                          </Selecao>
                          <BotaoEnviar variante="fantasma" className="h-8 px-2 text-xs">
                            Mover
                          </BotaoEnviar>
                        </Formulario>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}
