import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Bus, Hand, ListChecks, MapPin, QrCode, Shuffle, UserRound } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Selecao, Selo, Titulo, Vazio, cx } from "@/components/ui";
import { CIDADES, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { dataBR } from "@/lib/tempo";
import { RESULTADOS, STATUS_VIAGEM, type ResultadoFrequencia, type StatusViagem } from "@/lib/viagens";
import { TempoReal } from "../tempo-real";
import { moverPonto, moverReserva, realocar } from "../acoes";

export const metadata: Metadata = { title: "Alunos da viagem" };

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

type Embarque = { tipo: "qr" | "manual"; motivo_manual: string | null; verificado_localizacao: boolean; registrado_em: string };
type Reserva = {
  id: string;
  ponto_id: string | null;
  viagem_dia_onibus_id: string | null;
  aluno: { usuario: { nome: string; telefone: string | null } | null } | null;
  ponto: { nome: string; ordem: number } | null;
  desembarque: { nome: string } | null;
  embarque: Embarque | Embarque[] | null;
  frequencia: { resultado: ResultadoFrequencia } | { resultado: ResultadoFrequencia }[] | null;
};
type OnibusDia = { id: string; placa: string; capacidade: number; motorista: string | null };

const um = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
const SEM_PONTO = "sem";

/**
 * Logística de uma viagem do dia: quem vai, onde embarca e desce, em qual ônibus.
 * Os alunos aparecem agrupados por ponto de embarque dentro de cada ônibus; dá para
 * mover um aluno ou um ponto inteiro, ou redistribuir tudo agrupando por ponto.
 */
export default async function AlunosDaViagem({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("semtransp");
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: v }, { data: escala }, { data: reservas }] = await Promise.all([
    supabase.from("viagens_dia").select("id, data, nome, cidade, sentido, saida_em, status").eq("id", id).maybeSingle(),
    supabase.from("viagem_dia_onibus").select("id, onibus(prefixo, placa, capacidade), motorista:motoristas(usuario:usuarios(nome))").eq("viagem_dia_id", id),
    supabase
      .from("reservas")
      .select(
        "id, ponto_id, viagem_dia_onibus_id, aluno:alunos(usuario:usuarios(nome, telefone)), ponto:pontos!reservas_ponto_id_fkey(nome, ordem), desembarque:pontos!reservas_ponto_desembarque_id_fkey(nome), embarque:embarques(tipo, motivo_manual, verificado_localizacao, registrado_em), frequencia(resultado)",
      )
      .eq("viagem_dia_id", id)
      .eq("status", "ativa"),
  ]);
  if (!v) notFound();

  const onibus: OnibusDia[] = (
    (escala ?? []) as unknown as {
      id: string;
      onibus: { prefixo: string; placa: string; capacidade: number } | null;
      motorista: { usuario: { nome: string } | null } | null;
    }[]
  )
    .map((e) => ({
      id: e.id,
      placa: e.onibus?.placa ?? e.onibus?.prefixo ?? "?",
      capacidade: e.onibus?.capacidade ?? 0,
      motorista: e.motorista?.usuario?.nome ?? null,
    }))
    .sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR", { numeric: true }));

  const lista = ((reservas ?? []) as unknown as Reserva[]).sort(
    (a, b) =>
      (a.ponto?.ordem ?? 999) - (b.ponto?.ordem ?? 999) ||
      (a.ponto?.nome ?? "").localeCompare(b.ponto?.nome ?? "", "pt-BR") ||
      (a.aluno?.usuario?.nome ?? "").localeCompare(b.aluno?.usuario?.nome ?? "", "pt-BR"),
  );
  const status = STATUS_VIAGEM[v.status as StatusViagem];
  const naoRetornou = lista.filter((r) => um(r.frequencia)?.resultado === "nao_retornou");
  const podeMexer = v.status !== "cancelada" && v.status !== "encerrada";

  // Resumo por ponto: quantos alunos e em quais ônibus estão.
  const pontos = agruparPorPonto(lista).map(([chave, nome, itens]) => ({
    chave,
    nome,
    total: itens.length,
    porOnibus: onibus.map((o) => ({ placa: o.placa, n: itens.filter((r) => r.viagem_dia_onibus_id === o.id).length })).filter((x) => x.n > 0),
    semOnibus: itens.filter((r) => !r.viagem_dia_onibus_id).length,
  }));

  const grupos = [
    ...onibus.map((o) => ({ ...o, itens: lista.filter((r) => r.viagem_dia_onibus_id === o.id) })),
    { id: "", placa: "", capacidade: 0, motorista: null, itens: lista.filter((r) => !r.viagem_dia_onibus_id) },
  ].filter((g) => g.id || g.itens.length > 0);

  return (
    <>
      <Titulo
        icone={ListChecks}
        descricao={`${SENTIDOS[v.sentido as Sentido]} · ${CIDADES[v.cidade as Cidade]} · ${dataBR(v.data)} às ${HORA.format(new Date(v.saida_em))} · ${lista.length} aluno(s)`}
        acoes={
          <>
            <TempoReal />
            {podeMexer && onibus.length > 0 && lista.length > 0 && (
              <AcaoRapida
                acao={realocar}
                campos={{ id: v.id }}
                rotulo="Distribuir agrupando por ponto"
                icone={<Shuffle />}
                confirmar="Redistribuir todos os alunos entre os ônibus, mantendo juntos os do mesmo ponto de embarque? As mudanças manuais serão desfeitas."
              />
            )}
            <BotaoLink variante="secundario" href={`/painel/dia?data=${v.data}${v.cidade === "itaperuna" ? "&cidade=itaperuna" : ""}`}>
              <ArrowLeft /> Painel do dia
            </BotaoLink>
          </>
        }
      >
        <span className="flex flex-wrap items-center gap-3">
          {v.nome} <Selo cor={status.cor}>{status.rotulo}</Selo>
        </span>
      </Titulo>

      {naoRetornou.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Não retornou ({naoRetornou.length})</p>
          <p className="text-sm text-amber-800">Embarcaram na ida de hoje e não leram o QR nesta volta.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {naoRetornou.map((r) => (
              <li key={r.id} className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-800 ring-1 ring-amber-200">
                {r.aluno?.usuario?.nome}
                {r.aluno?.usuario?.telefone && <span className="ml-2 text-xs text-slate-500">{r.aluno.usuario.telefone}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lista.length === 0 ? (
        <Vazio icone={UserRound}>Nenhum aluno reservou esta viagem.</Vazio>
      ) : (
        <>
          {/* Resumo por ponto de embarque */}
          <div className="mb-6 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-suave">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Ponto de embarque</th>
                  <th className="px-4 py-2.5">Alunos</th>
                  <th className="px-4 py-2.5">Em qual ônibus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pontos.map((p) => (
                  <tr key={p.chave}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      <MapPin className="mr-1.5 inline size-3.5 text-slate-400" />
                      {p.nome}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{p.total}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        {p.porOnibus.map((x) => (
                          <span key={x.placa} className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-bold text-white">
                            {x.placa}
                            {p.porOnibus.length > 1 || p.semOnibus ? <span className="ml-1 font-normal opacity-80">×{x.n}</span> : null}
                          </span>
                        ))}
                        {p.semOnibus > 0 && <Selo cor="amarelo">{p.semOnibus} sem ônibus</Selo>}
                        {p.porOnibus.length > 1 && <span className="text-xs text-amber-700">ponto dividido</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ônibus, com os alunos por ponto */}
          <div className="grid items-start gap-6 xl:grid-cols-2">
            {grupos.map((g) => (
              <section key={g.id || "sem"} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-suave">
                <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                  {g.id ? (
                    <span className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 text-sm font-black text-white">
                      <Bus className="size-4" /> {g.placa}
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700">Sem ônibus definido</span>
                  )}
                  {g.id && <span className="text-sm text-slate-600">{g.motorista ?? <span className="text-amber-700">sem motorista</span>}</span>}
                  {g.id && (
                    <span className="ml-auto">
                      <Selo cor={g.itens.length > g.capacidade ? "vermelho" : "cinza"}>
                        {g.itens.length}/{g.capacidade} lugares
                      </Selo>
                    </span>
                  )}
                </header>
                {g.itens.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-400">Nenhum aluno neste ônibus.</p>
                ) : (
                  agruparPorPonto(g.itens).map(([chave, nome, itens]) => (
                    <div key={chave} className="border-b border-slate-100 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-4 py-2">
                        <MapPin className="size-3.5 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-700">{nome}</span>
                        <span className="text-xs text-slate-500">({itens.length})</span>
                        {podeMexer && onibus.length > 1 && (
                          <MoverPara
                            acao={moverPonto}
                            campos={{ viagem_id: v.id, ponto_id: chave }}
                            destinos={onibus.filter((o) => o.id !== g.id)}
                            rotulo="Mover ponto"
                          />
                        )}
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {itens.map((r) => {
                          const e = um(r.embarque);
                          const f = um(r.frequencia);
                          return (
                            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">{r.aluno?.usuario?.nome}</p>
                                <p className="truncate text-xs text-slate-500">
                                  Desce: {r.desembarque?.nome ?? <span className="text-amber-700">não escolheu</span>}
                                </p>
                                {e && (
                                  <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                                    {e.tipo === "qr" ? <QrCode className="size-3" /> : <Hand className="size-3" />}
                                    {e.tipo === "qr" ? "Leu o QR" : `Manual: ${e.motivo_manual}`} às {HORA.format(new Date(e.registrado_em))}
                                  </p>
                                )}
                              </div>
                              {f && <Selo cor={RESULTADOS[f.resultado].cor}>{RESULTADOS[f.resultado].rotulo}</Selo>}
                              {podeMexer && onibus.length > (g.id ? 1 : 0) && (
                                <MoverPara
                                  acao={moverReserva}
                                  campos={{ reserva_id: r.id }}
                                  destinos={onibus.filter((o) => o.id !== g.id)}
                                  rotulo="Mover"
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Agrupa as reservas pelo ponto de embarque, na ordem da rota. */
function agruparPorPonto(reservas: Reserva[]): [string, string, Reserva[]][] {
  const mapa = new Map<string, { nome: string; itens: Reserva[] }>();
  for (const r of reservas) {
    const chave = r.ponto_id ?? SEM_PONTO;
    const atual = mapa.get(chave) ?? { nome: r.ponto?.nome ?? "Sem ponto escolhido", itens: [] };
    atual.itens.push(r);
    mapa.set(chave, atual);
  }
  return [...mapa.entries()].map(([chave, x]) => [chave, x.nome, x.itens]);
}

function MoverPara({
  acao,
  campos,
  destinos,
  rotulo,
}: {
  acao: typeof moverReserva;
  campos: Record<string, string>;
  destinos: OnibusDia[];
  rotulo: string;
}) {
  return (
    <Formulario acao={acao} className={cx("ml-auto flex-row items-center gap-1.5")}>
      {Object.entries(campos).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <Selecao name="destino" defaultValue="" required className="w-32 [&_select]:h-8 [&_select]:text-xs" aria-label="Mover para">
        <option value="" disabled>
          Para o ônibus…
        </option>
        {destinos.map((o) => (
          <option key={o.id} value={o.id}>
            Ônibus {o.placa}
          </option>
        ))}
      </Selecao>
      <BotaoEnviar variante="fantasma" className="h-8 px-2 text-xs">
        {rotulo}
      </BotaoEnviar>
    </Formulario>
  );
}
