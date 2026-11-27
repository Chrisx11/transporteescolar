"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Bus,
  CheckCircle2,
  Clock3,
  Hourglass,
  Loader2,
  MapPin,
  ScanLine,
  TicketCheck,
  XCircle,
} from "lucide-react";
import { Botao, BotaoLink, Selecao, Selo, cx } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";
import { CIDADES_CURTO } from "@/lib/rotulos";
import { RESULTADOS, tempoRestante, type MinhaViagem, type PontoOpcao } from "@/lib/viagens";
import { cancelarReserva, reservarIdaEVolta, reservarViagem } from "./acoes";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DIA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const mesmoDia = (a: Date, b: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(a) ===
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(b);

/** Relógio que atualiza a cada 30 s (contagem regressiva do prazo). */
function useAgora() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

export function CartaoViagem({ v, pontos, voltas = [] }: { v: MinhaViagem; pontos: PontoOpcao[]; voltas?: MinhaViagem[] }) {
  const router = useRouter();
  const agora = useAgora();
  const [pendente, iniciar] = useTransition();
  const [janela, confirmar] = useConfirmacao();
  const [escolhendo, setEscolhendo] = useState(false);
  // Ida nova com voltas disponíveis: depois dos pontos da ida, o aluno escolhe a volta.
  const [pontosIda, setPontosIda] = useState<{ embarque: string | null; desembarque: string | null } | null>(null);
  const ida = v.sentido === "ida";
  const Icone = ida ? ArrowUpRight : ArrowDownLeft;
  const saida = new Date(v.saida_em);
  const prazo = v.prazo_em ? new Date(v.prazo_em) : null;
  const restante = prazo ? prazo.getTime() - agora : 0;
  const reservado = !!v.reserva_id;
  const cancelada = v.status_viagem === "cancelada";

  // Quando o prazo vence com a tela aberta, recarrega para mostrar o ônibus.
  const venceu = !!v.prazo_em && restante <= 0;
  useEffect(() => {
    if (venceu && v.status_viagem === "agendada") router.refresh();
  }, [venceu, v.status_viagem, router]);

  // Ida: embarca em Italva e desce na cidade. Volta: o contrário.
  const cidadeEmbarque = ida ? "italva" : v.cidade;
  const cidadeDesembarque = ida ? v.cidade : "italva";

  function reservar(embarque: string | null, desembarque: string | null) {
    if (!v.viagem_dia_id) return;
    const trocando = reservado;
    iniciar(async () => {
      const r = await reservarViagem(v.viagem_dia_id!, embarque, desembarque);
      if (r.ok) {
        lembrarPontos(v.sentido, v.cidade, embarque, desembarque);
        toast.success(trocando ? "Pontos atualizados." : `${v.nome} reservada!`);
        setEscolhendo(false);
      } else toast.error(r.erro);
      router.refresh();
    });
  }

  const escolheVolta = !reservado && voltas.length > 0;

  function reservarComVolta(volta: MinhaViagem | null, embarque: string | null, desembarque: string | null) {
    if (!v.viagem_dia_id || !pontosIda) return;
    iniciar(async () => {
      const r = await reservarIdaEVolta(
        { viagem: v.viagem_dia_id!, ...pontosIda },
        volta?.viagem_dia_id ? { viagem: volta.viagem_dia_id, embarque, desembarque } : null,
      );
      if (r.ok) {
        lembrarPontos(v.sentido, v.cidade, pontosIda.embarque, pontosIda.desembarque);
        if (volta) lembrarPontos("volta", volta.cidade, embarque, desembarque);
        if (r.erroVolta) toast.warning(`Ida reservada, mas a volta não: ${r.erroVolta}`);
        else toast.success(volta ? `Ida e volta reservadas! Volta às ${HORA.format(new Date(volta.saida_em))}.` : `${v.nome} reservada!`);
        setPontosIda(null);
        setEscolhendo(false);
      } else toast.error(r.erro);
      router.refresh();
    });
  }

  async function cancelar() {
    if (!v.reserva_id || !(await confirmar(`Cancelar sua reserva da ${v.nome.toLowerCase()}?`))) return;
    iniciar(async () => {
      const r = await cancelarReserva(v.reserva_id!);
      if (r.ok) toast.success("Reserva cancelada.");
      else toast.error(r.erro);
      router.refresh();
    });
  }

  // "Até 15:00 · faltam 2h 10min" ou, se o prazo é no dia anterior, "Até dom., 25/10 19:00 · …"
  const textoPrazo = prazo
    ? `Até ${mesmoDia(prazo, saida) ? HORA.format(prazo) : DIA_HORA.format(prazo)} · faltam ${tempoRestante(restante)}`
    : null;

  return (
    <article
      className={cx(
        "overflow-hidden rounded-3xl bg-white shadow-suave ring-1 transition-shadow",
        reservado && !cancelada ? "ring-emerald-200" : "ring-transparent",
      )}
    >
      {janela}
      <div className="flex items-center gap-4 p-5">
        <span
          className={cx(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
            ida ? "from-azul-500 to-azul-700" : "from-emerald-400 to-teal-600",
          )}
        >
          <Icone className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ida ? "Ida" : "Volta"}</p>
          <p className="truncate font-semibold text-slate-900">{v.nome}</p>
          <p className="flex items-center gap-1 truncate text-sm text-slate-500">
            <MapPin className="size-3.5 shrink-0" />
            {ida ? `Italva → ${CIDADES_CURTO[v.cidade]}` : `${CIDADES_CURTO[v.cidade]} → Italva`}
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-xs text-slate-400">
            <Clock3 className="size-3.5" /> saída
          </p>
          <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{HORA.format(saida)}</p>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        {cancelada ? (
          <Faixa icone={Ban} cor="text-red-600" titulo="Viagem cancelada" texto="Veja os avisos para saber o motivo." />
        ) : escolhendo && escolheVolta && pontosIda ? (
          <EscolherVolta voltas={voltas} pontos={pontos} pendente={pendente} aoConfirmar={reservarComVolta} aoVoltar={() => setPontosIda(null)} />
        ) : escolhendo ? (
          <EscolherPontos
            pontos={pontos}
            cidadeEmbarque={cidadeEmbarque}
            cidadeDesembarque={cidadeDesembarque}
            linha={v.cidade as "campos" | "itaperuna"}
            inicial={pontosIda ? { embarque: pontosIda.embarque ?? "", desembarque: pontosIda.desembarque ?? "" } : lembrados(v.sentido, v.cidade, v.ponto_embarque_id, v.ponto_desembarque_id)}
            rotulo={reservado ? "Salvar pontos" : escolheVolta ? "Continuar: escolher a volta" : "Confirmar reserva"}
            pendente={pendente}
            aoConfirmar={escolheVolta ? (embarque, desembarque) => setPontosIda({ embarque, desembarque }) : reservar}
            aoCancelar={() => setEscolhendo(false)}
          />
        ) : reservado && v.pode_cancelar ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <Faixa icone={CheckCircle2} cor="text-emerald-600" titulo="Reservado" texto={textoPrazo ?? undefined} />
              <Botao variante="secundario" onClick={cancelar} disabled={pendente} className="h-9 px-3 text-xs">
                {pendente ? <Loader2 className="animate-spin" /> : <XCircle />} Cancelar
              </Botao>
            </div>
            <PontosEscolhidos v={v} aoTrocar={() => setEscolhendo(true)} />
          </div>
        ) : reservado ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-azul-600 text-white shadow-lg shadow-azul-600/30">
                <Bus className="size-4 opacity-80" />
                <span className="text-lg font-black leading-none">{v.onibus_prefixo ?? "–"}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {v.onibus_prefixo ? `Seu ônibus: ${v.onibus_prefixo}` : "Definindo seu ônibus…"}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {v.ponto_nome ? `Embarque: ${v.ponto_nome}` : "Ponto de embarque não escolhido"}
                  {v.ponto_desembarque_nome ? ` · Desce: ${v.ponto_desembarque_nome}` : ""}
                </p>
              </div>
              {v.resultado ? (
                <Selo cor={RESULTADOS[v.resultado].cor}>{RESULTADOS[v.resultado].rotulo}</Selo>
              ) : v.embarcado ? (
                <Selo cor="verde">Embarcado</Selo>
              ) : null}
            </div>
            {!v.embarcado && !v.resultado && v.embarque_de && v.embarque_ate && (
              agora >= new Date(v.embarque_de).getTime() && agora <= new Date(v.embarque_ate).getTime() ? (
                <BotaoLink href="/app/ler-qr" className="h-12 w-full text-base">
                  <ScanLine /> Ler QR code do ônibus
                </BotaoLink>
              ) : agora < new Date(v.embarque_de).getTime() ? (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ScanLine className="size-3.5" /> Leitura do QR das {HORA.format(new Date(v.embarque_de))} às{" "}
                  {HORA.format(new Date(v.embarque_ate))}
                </p>
              ) : null
            )}
          </div>
        ) : !v.motivo ? (
          <div className="flex items-center justify-between gap-3">
            <Faixa icone={Hourglass} cor="text-azul-600" titulo="Reserva aberta" texto={textoPrazo ?? undefined} />
            <Botao onClick={() => setEscolhendo(true)} disabled={pendente} className="h-11 px-5">
              {pendente ? <Loader2 className="animate-spin" /> : <TicketCheck />} Reservar
            </Botao>
          </div>
        ) : v.motivo === "ainda_nao_abriu" && v.abertura_em ? (
          <Faixa
            icone={Clock3}
            cor="text-slate-500"
            titulo="Reserva ainda não abriu"
            texto={`Abre ${DIA_HORA.format(new Date(v.abertura_em)).replace(",", "")}`}
          />
        ) : v.motivo === "prazo_encerrado" ? (
          <Faixa icone={Ban} cor="text-slate-400" titulo="Prazo encerrado" texto="Você não reservou esta viagem." />
        ) : (
          <Faixa icone={Ban} cor="text-amber-600" titulo="Reserva indisponível" texto={v.mensagem ?? undefined} />
        )}
      </div>
    </article>
  );
}

function Faixa({
  icone: Icone,
  cor,
  titulo,
  texto,
}: {
  icone: typeof Ban;
  cor: string;
  titulo: string;
  texto?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icone className={cx("mt-0.5 size-5 shrink-0", cor)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{titulo}</p>
        {texto && <p className="text-xs text-slate-500">{texto}</p>}
      </div>
    </div>
  );
}

const NOME_CIDADE = { italva: "Italva", campos: "Campos", itaperuna: "Itaperuna" } as const;

/** Últimos pontos usados pelo aluno para o mesmo sentido e cidade (salvos no celular). */
const chavePontos = (sentido: string, cidade: string) => `pontos-${sentido}-${cidade}`;
function lembrarPontos(sentido: string, cidade: string, embarque: string | null, desembarque: string | null) {
  try {
    localStorage.setItem(chavePontos(sentido, cidade), JSON.stringify({ embarque, desembarque }));
  } catch {}
}
function lembrados(sentido: string, cidade: string, embarque: string | null, desembarque: string | null) {
  let salvo: { embarque?: string | null; desembarque?: string | null } = {};
  try {
    salvo = JSON.parse(localStorage.getItem(chavePontos(sentido, cidade)) ?? "{}");
  } catch {}
  return { embarque: embarque ?? salvo.embarque ?? "", desembarque: desembarque ?? salvo.desembarque ?? "" };
}

function PontosEscolhidos({ v, aoTrocar }: { v: MinhaViagem; aoTrocar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-slate-100">
      <span className="min-w-0 text-slate-600">
        <span className="font-medium text-slate-800">Embarque:</span> {v.ponto_nome ?? "não escolhido"}
        <br />
        <span className="font-medium text-slate-800">Desce:</span> {v.ponto_desembarque_nome ?? "não escolhido"}
      </span>
      <button type="button" onClick={aoTrocar} className="shrink-0 font-semibold text-azul-700">
        Trocar pontos
      </button>
    </div>
  );
}

function EscolherPontos({
  pontos,
  cidadeEmbarque,
  cidadeDesembarque,
  linha,
  inicial,
  rotulo,
  pendente,
  aoConfirmar,
  aoCancelar,
}: {
  pontos: PontoOpcao[];
  cidadeEmbarque: PontoOpcao["cidade"];
  cidadeDesembarque: PontoOpcao["cidade"];
  linha: "campos" | "itaperuna";
  inicial: { embarque: string; desembarque: string };
  rotulo: string;
  pendente: boolean;
  aoConfirmar: (embarque: string | null, desembarque: string | null) => void;
  aoCancelar: () => void;
}) {
  // Só os pontos da linha da viagem (os sem linha definida servem às duas).
  const daLinha = (p: PontoOpcao) => !p.linha || p.linha === linha;
  const deEmbarque = pontos.filter((p) => p.cidade === cidadeEmbarque && daLinha(p));
  const deDesembarque = pontos.filter((p) => p.cidade === cidadeDesembarque && daLinha(p));
  const valido = (id: string, lista: PontoOpcao[]) => (lista.some((p) => p.id === id) ? id : "");
  const [embarque, setEmbarque] = useState(valido(inicial.embarque, deEmbarque));
  const [desembarque, setDesembarque] = useState(valido(inicial.desembarque, deDesembarque));
  const falta = (deEmbarque.length > 0 && !embarque) || (deDesembarque.length > 0 && !desembarque);

  const campo = (rotuloCampo: string, cidade: PontoOpcao["cidade"], lista: PontoOpcao[], valor: string, mudar: (s: string) => void) => (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
      {rotuloCampo} ({NOME_CIDADE[cidade]})
      {lista.length === 0 ? (
        <span className="text-xs font-normal text-slate-400">Nenhum ponto cadastrado nesta cidade.</span>
      ) : (
        <Selecao value={valor} onChange={(e) => mudar(e.target.value)}>
          <option value="">— escolha —</option>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Selecao>
      )}
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      {campo("Onde vai embarcar", cidadeEmbarque, deEmbarque, embarque, setEmbarque)}
      {campo("Onde vai descer", cidadeDesembarque, deDesembarque, desembarque, setDesembarque)}
      <div className="flex gap-2">
        <Botao variante="secundario" onClick={aoCancelar} disabled={pendente} className="h-11 flex-1">
          Voltar
        </Botao>
        <Botao onClick={() => aoConfirmar(embarque || null, desembarque || null)} disabled={pendente || falta} className="h-11 flex-[2]">
          {pendente ? <Loader2 className="animate-spin" /> : <TicketCheck />} {rotulo}
        </Botao>
      </div>
    </div>
  );
}

/** Segundo passo da reserva da ida: escolher a volta do mesmo dia (ou nenhuma) e os pontos dela. */
function EscolherVolta({
  voltas,
  pontos,
  pendente,
  aoConfirmar,
  aoVoltar,
}: {
  voltas: MinhaViagem[];
  pontos: PontoOpcao[];
  pendente: boolean;
  aoConfirmar: (volta: MinhaViagem | null, embarque: string | null, desembarque: string | null) => void;
  aoVoltar: () => void;
}) {
  const [escolha, setEscolha] = useState<string>(voltas.length === 1 ? voltas[0].viagem_dia_id! : "");
  const volta = voltas.find((x) => x.viagem_dia_id === escolha) ?? null;

  const opcao = (chave: string, titulo: string, texto: string) => (
    <button
      key={chave}
      type="button"
      onClick={() => setEscolha(chave)}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors",
        escolha === chave ? "bg-emerald-50 ring-2 ring-emerald-500" : "bg-white ring-slate-200 hover:bg-slate-50",
      )}
    >
      <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full ring-2", escolha === chave ? "bg-emerald-500 ring-emerald-500" : "ring-slate-300")}>
        {escolha === chave && <span className="size-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{titulo}</span>
        <span className="block text-xs text-slate-500">{texto}</span>
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ArrowDownLeft className="size-5 text-emerald-600" />
        <p className="text-sm font-semibold text-slate-900">Agora escolha a sua volta</p>
      </div>
      <div className="flex flex-col gap-2">
        {voltas.map((x) =>
          opcao(
            x.viagem_dia_id!,
            `${x.nome} · ${HORA.format(new Date(x.saida_em))}`,
            `${CIDADES_CURTO[x.cidade]} → Italva${x.prazo_em ? ` · reserva até ${HORA.format(new Date(x.prazo_em))}` : ""}`,
          ),
        )}
        {opcao("nenhuma", "Não vou precisar de volta", "Você pode reservar a volta depois, dentro do prazo.")}
      </div>

      {volta ? (
        <EscolherPontos
          key={escolha}
          pontos={pontos}
          cidadeEmbarque={volta.cidade}
          cidadeDesembarque="italva"
          linha={volta.cidade as "campos" | "itaperuna"}
          inicial={lembrados("volta", volta.cidade, null, null)}
          rotulo="Confirmar ida e volta"
          pendente={pendente}
          aoConfirmar={(embarque, desembarque) => aoConfirmar(volta, embarque, desembarque)}
          aoCancelar={aoVoltar}
        />
      ) : (
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={aoVoltar} disabled={pendente} className="h-11 flex-1">
            Voltar
          </Botao>
          <Botao onClick={() => aoConfirmar(null, null, null)} disabled={pendente || escolha !== "nenhuma"} className="h-11 flex-[2]">
            {pendente ? <Loader2 className="animate-spin" /> : <TicketCheck />} Confirmar só a ida
          </Botao>
        </div>
      )}
    </div>
  );
}
