import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Bus,
  CalendarPlus,
  Clock3,
  Gauge,
  ListChecks,
  MoveRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Trash2,
  Users,
} from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { Aviso, Entrada, Estatistica, LinkAcao, Selecao, Selo, Titulo, Vazio, cx } from "@/components/ui";
import { CIDADES, type Cidade } from "@/lib/rotulos";
import { DIAS_SEMANA, dataBR, diaSemanaIso, hojeSP, somarDias } from "@/lib/tempo";
import { STATUS_VIAGEM, tempoRestante } from "@/lib/viagens";
import { carregarDia, type ViagemDoDia } from "./dados";
import { TempoReal } from "./tempo-real";
import {
  adicionarOnibusDia,
  cancelarViagem,
  gerarViagens,
  reaplicarEscala,
  realocar,
  removerOnibusDia,
  trocarMotoristaDia,
} from "./acoes";

export const metadata: Metadata = { title: "Painel do dia" };

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

type Opcao = { id: string; rotulo: string };

function Prazo({ v }: { v: ViagemDoDia }) {
  if (!v.prazo_em) return <span className="text-xs text-slate-400">sem reserva</span>;
  const prazo = new Date(v.prazo_em);
  const falta = prazo.getTime() - Date.now();
  if (v.status === "agendada" && falta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-azul-700">
        <Clock3 className="size-3.5" /> fecha {HORA.format(prazo)} · em {tempoRestante(falta)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Clock3 className="size-3.5" /> fechou {HORA.format(prazo)}
    </span>
  );
}

function BarraOcupacao({ reservas, capacidade }: { reservas: number; capacidade: number }) {
  const pct = capacidade > 0 ? Math.round((reservas / capacidade) * 100) : reservas > 0 ? 100 : 0;
  const excesso = reservas > capacidade;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-900">
          {reservas} <span className="font-normal text-slate-500">de {capacidade} lugares</span>
        </span>
        <span className={cx("text-xs font-semibold", excesso ? "text-red-600" : pct >= 90 ? "text-amber-600" : "text-slate-500")}>
          {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cx("h-full rounded-full transition-all", excesso ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-azul-600")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function CartaoViagemDia({ v, onibus, motoristas }: { v: ViagemDoDia; onibus: Opcao[]; motoristas: Opcao[] }) {
  const Icone = v.sentido === "ida" ? ArrowUpRight : v.sentido === "volta" ? ArrowDownLeft : MoveRight;
  const cor = v.sentido === "ida" ? "from-azul-500 to-azul-700" : v.sentido === "volta" ? "from-emerald-400 to-teal-600" : "from-slate-400 to-slate-600";
  const status =
    v.sentido === "deslocamento_vazio" && v.status === "agendada"
      ? { rotulo: "Agendada", cor: "cinza" as const }
      : STATUS_VIAGEM[v.status];
  const cancelada = v.status === "cancelada";
  const reservavel = v.sentido !== "deslocamento_vazio";
  const livres = onibus.filter((o) => !v.onibus.some((x) => x.onibus_id === o.id));

  return (
    <article
      className={cx(
        "flex flex-col rounded-2xl border bg-white shadow-suave",
        v.alertas.some((a) => a.tipo === "erro") ? "border-red-200" : "border-slate-200/80",
        cancelada && "opacity-70",
      )}
    >
      <header className="flex items-start gap-3 p-5 pb-4">
        <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", cor)}>
          <Icone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold tabular-nums tracking-tight">{HORA.format(new Date(v.saida_em))}</span>
            <span className="truncate font-semibold text-slate-800">{v.nome}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Selo cor={status.cor}>{status.rotulo}</Selo>
            {reservavel && <Prazo v={v} />}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
        {cancelada && v.ocorrencia_descricao && <Aviso tipo="erro">Cancelada: {v.ocorrencia_descricao}</Aviso>}
        {reservavel && <BarraOcupacao reservas={v.reservas} capacidade={v.capacidade} />}

        {v.alertas.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {v.alertas.map((a, i) => (
              <li
                key={i}
                className={cx(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                  a.tipo === "erro" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
                )}
              >
                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {a.texto}
              </li>
            ))}
          </ul>
        )}

        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-100">
          {v.onibus.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Sem ônibus nesta viagem.</li>}
          {v.onibus.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white">
                {o.prefixo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  {reservavel ? (
                    <>
                      <Users className="size-3.5 text-slate-400" /> {o.alocados}/{o.capacidade}
                    </>
                  ) : (
                    <>{o.capacidade} lugares</>
                  )}
                  {o.extra && <Selo cor="azul">extra</Selo>}
                </p>
                {!cancelada ? (
                  <Formulario acao={trocarMotoristaDia} className="mt-1 flex-row items-center gap-1.5">
                    <input type="hidden" name="id" value={o.id} />
                    <Selecao name="motorista_id" defaultValue={o.motorista_id ?? ""} className="w-44 [&_select]:h-8 [&_select]:text-xs">
                      <option value="">sem motorista</option>
                      {motoristas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.rotulo}
                        </option>
                      ))}
                    </Selecao>
                    <BotaoEnviar variante="fantasma" className="h-8 px-2 text-xs">
                      Salvar
                    </BotaoEnviar>
                  </Formulario>
                ) : (
                  <p className="text-xs text-slate-500">{o.motorista_nome ?? "sem motorista"}</p>
                )}
              </div>
              {!cancelada && (
                <AcaoRapida
                  acao={removerOnibusDia}
                  campos={{ id: o.id }}
                  rotulo=""
                  icone={<Trash2 />}
                  confirmar={`Tirar o ônibus ${o.prefixo} desta viagem? Os alunos dele ficarão sem ônibus até realocar.`}
                />
              )}
            </li>
          ))}
        </ul>

        {!cancelada && (
          <details className="group rounded-xl border border-dashed border-slate-200 open:border-solid open:bg-slate-50/60">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-azul-700">
              <Plus className="size-3.5" /> Adicionar ônibus extra
            </summary>
            <Formulario acao={adicionarOnibusDia} className="gap-2 px-3 pb-3">
              <input type="hidden" name="viagem_dia_id" value={v.id} />
              <div className="grid grid-cols-2 gap-2">
                <Selecao name="onibus_id" required defaultValue="" aria-label="Ônibus">
                  <option value="" disabled>
                    Ônibus…
                  </option>
                  {livres.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </Selecao>
                <Selecao name="motorista_id" defaultValue="" aria-label="Motorista">
                  <option value="">Motorista…</option>
                  {motoristas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                  ))}
                </Selecao>
              </div>
              <BotaoEnviar variante="secundario" className="h-9">
                <Plus /> Adicionar
              </BotaoEnviar>
            </Formulario>
          </details>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
        {reservavel && (
          <LinkAcao href={`/painel/dia/${v.id}`} icone={ListChecks}>
            Ver alunos
          </LinkAcao>
        )}
        {!cancelada && reservavel && (
          <AcaoRapida
            acao={realocar}
            campos={{ id: v.id }}
            rotulo="Realocar alunos"
            variante="fantasma"
            icone={<Shuffle />}
            confirmar="Distribuir de novo os alunos entre os ônibus desta viagem?"
          />
        )}
        {v.status === "agendada" && (
          <AcaoRapida
            acao={reaplicarEscala}
            campos={{ id: v.id }}
            rotulo="Reaplicar escala"
            variante="fantasma"
            icone={<RotateCcw />}
            confirmar="Trocar os ônibus desta viagem pelos da escala modelo? Ônibus extras serão removidos."
          />
        )}
        {!cancelada && v.status !== "encerrada" && (
          <details className="ml-auto">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50">
              <Ban className="size-3.5" /> Cancelar viagem
            </summary>
            <Formulario acao={cancelarViagem} confirmar="Cancelar esta viagem? Os alunos reservados serão avisados." className="mt-2 gap-2">
              <input type="hidden" name="id" value={v.id} />
              <Entrada name="motivo" required placeholder="Motivo (ex.: pane no ônibus)" />
              <BotaoEnviar variante="perigo" className="h-9">
                Confirmar cancelamento
              </BotaoEnviar>
            </Formulario>
          </details>
        )}
      </footer>
    </article>
  );
}

export default async function PainelDoDia({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  await exigirPerfil("semtransp");
  const hoje = hojeSP();
  const pedida = (await searchParams).data;
  const data = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoje;

  const supabase = await criarClienteServidor();
  const [viagens, { data: onibus }, { data: motoristas }] = await Promise.all([
    carregarDia(data),
    supabase.from("onibus").select("id, prefixo, capacidade, situacao").eq("situacao", "ativo").order("prefixo"),
    supabase.from("motoristas").select("usuario_id, usuario:usuarios(nome, ativo)"),
  ]);

  const opcoesOnibus: Opcao[] = (onibus ?? []).map((o) => ({ id: o.id, rotulo: `${o.prefixo} (${o.capacidade} lugares)` }));
  const opcoesMotoristas: Opcao[] = ((motoristas ?? []) as unknown as { usuario_id: string; usuario: { nome: string; ativo: boolean } }[])
    .filter((m) => m.usuario.ativo)
    .map((m) => ({ id: m.usuario_id, rotulo: m.usuario.nome }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  const reservaveis = viagens.filter((v) => v.sentido !== "deslocamento_vazio" && v.status !== "cancelada");
  const totalReservas = reservaveis.reduce((s, v) => s + v.reservas, 0);
  const totalCapacidade = reservaveis.reduce((s, v) => s + v.capacidade, 0);
  const totalAlertas = viagens.reduce((s, v) => s + v.alertas.length, 0);
  const dias = [
    { rotulo: "Hoje", data: hoje },
    { rotulo: "Amanhã", data: somarDias(hoje, 1) },
    { rotulo: "Depois de amanhã", data: somarDias(hoje, 2) },
  ];
  const nomeDia = DIAS_SEMANA.find((d) => d.valor === diaSemanaIso(data))?.nome;

  return (
    <>
      <Titulo
        icone={Activity}
        descricao={`${nomeDia}, ${dataBR(data)} — reservas, escala e alertas de cada viagem.`}
        acoes={
          <>
            <TempoReal />
            <AcaoRapida acao={gerarViagens} campos={{}} rotulo="Gerar viagens" variante="secundario" icone={<CalendarPlus />} />
          </>
        }
      >
        Painel do dia
      </Titulo>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {dias.map((d) => (
            <Link
              key={d.data}
              href={d.data === hoje ? "/painel/dia" : `/painel/dia?data=${d.data}`}
              className={cx(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                d.data === data ? "bg-white text-azul-800 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {d.rotulo}
            </Link>
          ))}
        </div>
        <form action="/painel/dia" className="flex items-center gap-2">
          <Entrada type="date" name="data" defaultValue={data} className="h-9 w-40" aria-label="Escolher data" />
          <button className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-white">
            <RefreshCw className="size-3.5" /> Ver
          </button>
        </form>
      </div>

      {viagens.length === 0 ? (
        <Vazio icone={Bus}>
          Nenhuma viagem gerada para {dataBR(data)}. Pode ser feriado, ou as viagens ainda não foram criadas — use “Gerar
          viagens” (cria hoje e os próximos 2 dias).
        </Vazio>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Estatistica rotulo="Viagens" valor={viagens.length} icone={Bus} cor="azul" />
            <Estatistica rotulo="Reservas" valor={totalReservas} icone={Users} cor="verde" />
            <Estatistica
              rotulo="Ocupação"
              valor={totalCapacidade ? `${Math.round((totalReservas / totalCapacidade) * 100)}%` : "–"}
              icone={Gauge}
              cor="ciano"
              detalhe={`${totalCapacidade} lugares escalados`}
            />
            <Estatistica rotulo="Alertas" valor={totalAlertas} icone={AlertTriangle} cor={totalAlertas ? "rosa" : "verde"} />
          </div>

          {(["campos", "itaperuna"] as Cidade[]).map((cidade) => {
            const daCidade = viagens.filter((v) => v.cidade === cidade);
            if (daCidade.length === 0) return null;
            return (
              <section key={cidade} className="mb-10">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{CIDADES[cidade]}</h2>
                <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {daCidade.map((v) => (
                    <CartaoViagemDia key={v.id} v={v} onibus={opcoesOnibus} motoristas={opcoesMotoristas} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
