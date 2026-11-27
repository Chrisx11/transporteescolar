"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bus,
  CheckCircle2,
  Circle,
  Clock3,
  CloudOff,
  Eye,
  Hand,
  Loader2,
  MapPin,
  Navigation,
  Play,
  QrCode,
  Square,
  UserRound,
} from "lucide-react";
import { Botao, Selo, cx } from "@/components/ui";
import { useConfirmacao } from "@/components/confirmacao";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { obterDispositivo } from "@/lib/device";
import { enfileirar, enviarFila, pendentes } from "@/lib/fila-presencas";
import { mensagemErro } from "@/lib/acoes";
import { CIDADES_CURTO, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { STATUS_VIAGEM, type StatusViagem } from "@/lib/viagens";

type Trecho = {
  id: string;
  iniciada_em: string | null;
  encerrada_em: string | null;
  onibus: { prefixo: string; capacidade: number } | null;
  viagem: { nome: string; cidade: Cidade; sentido: Sentido; saida_em: string; status: StatusViagem; prazo_em: string | null } | null;
};

type Aluno = {
  reserva_id: string;
  aluno_id: string;
  nome: string;
  foto_path: string | null;
  ponto_nome: string | null;
  ponto_ordem: number | null;
  embarcado: boolean;
  tipo: "qr" | "manual" | null;
  motivo_manual: string | null;
  desembarque_nome?: string | null;
  /** Reservado, mas o ônibus ainda não foi definido (prazo aberto): lista prévia da viagem. */
  previa?: boolean;
};

type Dados = { trecho: Trecho; alunos: Aluno[]; salvoEm: string };

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const MOTIVOS = ["Aluno sem celular", "Celular sem bateria", "Celular não lê o QR", "Sem internet no celular do aluno"];
const ENVIO_LOCAL_MS = 20_000;
const ATUALIZAR_MS = 15_000;

const chaveCache = (vdo: string) => `trecho-${vdo}`;
function lerCache(vdo: string): Dados | null {
  try {
    return JSON.parse(localStorage.getItem(chaveCache(vdo)) ?? "null") as Dados | null;
  } catch {
    return null;
  }
}
function gravarCache(vdo: string, d: Dados) {
  try {
    localStorage.setItem(chaveCache(vdo), JSON.stringify(d));
  } catch {
    // sem espaço: segue sem cache
  }
}

export function TelaTrecho({ vdo }: { vdo: string }) {
  const router = useRouter();
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [dados, setDados] = useState<Dados | null>(null);
  const [online, setOnline] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [manualPara, setManualPara] = useState<Aluno | null>(null);
  const [fila, setFila] = useState(0);
  const [gps, setGps] = useState<"parado" | "enviando" | "erro">("parado");
  const [erroGps, setErroGps] = useState<string | null>(null);
  const [janela, confirmar] = useConfirmacao();
  const ultimoEnvio = useRef(0);

  const carregar = useCallback(async () => {
    const [t, l] = await Promise.all([
      supabase
        .from("viagem_dia_onibus")
        .select("id, iniciada_em, encerrada_em, onibus(prefixo, capacidade), viagem:viagens_dia(nome, cidade, sentido, saida_em, status, prazo_em)")
        .eq("id", vdo)
        .maybeSingle(),
      supabase.rpc("lista_embarque", { p_vdo: vdo }),
    ]);
    if (t.error || l.error) {
      const e = t.error ?? l.error;
      if (e && e.code) toast.error(mensagemErro(e));
      return false; // sem conexão: fica com o que está salvo no celular
    }
    if (!t.data) {
      toast.error("Viagem não encontrada.");
      return false;
    }
    const novo: Dados = { trecho: t.data as unknown as Trecho, alunos: (l.data ?? []) as Aluno[], salvoEm: new Date().toISOString() };
    setDados(novo);
    gravarCache(vdo, novo);
    return true;
  }, [supabase, vdo]);

  const sincronizar = useCallback(async () => {
    if (pendentes().length) {
      const r = await enviarFila(supabase);
      if (r.enviados) toast.success(`${r.enviados} presença(s) enviada(s).`);
      r.recusados.forEach((m) => toast.error(m));
    }
    setFila(pendentes(vdo).length);
    await carregar();
  }, [supabase, carregar, vdo]);

  // Primeira carga: mostra o salvo no celular na hora e busca o atual.
  useEffect(() => {
    const salvo = lerCache(vdo);
    if (salvo) setDados(salvo);
    setFila(pendentes(vdo).length);
    setOnline(navigator.onLine);
    void sincronizar();
  }, [vdo, sincronizar]);

  // Sinal volta → envia a fila. Atualiza a lista a cada 15 s (quem leu o QR).
  useEffect(() => {
    const ligou = () => {
      setOnline(true);
      void sincronizar();
    };
    const caiu = () => setOnline(false);
    window.addEventListener("online", ligou);
    window.addEventListener("offline", caiu);
    const t = setInterval(() => {
      if (navigator.onLine) void sincronizar();
    }, ATUALIZAR_MS);
    return () => {
      window.removeEventListener("online", ligou);
      window.removeEventListener("offline", caiu);
      clearInterval(t);
    };
  }, [sincronizar]);

  // Fotos por URL assinada (bucket privado).
  const caminhos = dados?.alunos.map((a) => a.foto_path).filter((p): p is string => !!p) ?? [];
  const chaveFotos = caminhos.join("|");
  useEffect(() => {
    if (!chaveFotos || !navigator.onLine) return;
    void supabase.storage
      .from("fotos")
      .createSignedUrls(chaveFotos.split("|"), 3600)
      .then(({ data }) => {
        const mapa: Record<string, string> = {};
        data?.forEach((d) => {
          if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
        });
        setFotos(mapa);
      });
  }, [chaveFotos, supabase]);

  const emAndamento = !!dados?.trecho.iniciada_em && !dados.trecho.encerrada_em;

  // Localização do motorista enquanto o trecho está em andamento (tela aberta).
  useEffect(() => {
    if (!emAndamento) {
      setGps("parado");
      return;
    }
    const parar = obterDispositivo().localizacao.acompanhar(
      (p) => {
        if (Date.now() - ultimoEnvio.current < ENVIO_LOCAL_MS) return;
        ultimoEnvio.current = Date.now();
        void supabase
          .rpc("enviar_localizacao", { p_vdo: vdo, p_lat: p.lat, p_lng: p.lng, p_precisao: Math.round(p.precisao) })
          .then(({ error }) => {
            if (!error) {
              setGps("enviando");
              setErroGps(null);
            }
          });
      },
      (e) => {
        setGps("erro");
        setErroGps(e.message);
      },
    );
    // Mantém a tela acesa durante a viagem, quando o aparelho permite.
    let trava: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request("screen").then((w) => (trava = w)).catch(() => {});
    return () => {
      parar();
      void trava?.release();
    };
  }, [emAndamento, supabase, vdo]);

  async function iniciar() {
    setOcupado(true);
    const { error } = await supabase.rpc("iniciar_trecho", { p_vdo: vdo });
    setOcupado(false);
    if (error) return toast.error(error.code ? mensagemErro(error) : "Sem internet. Tente de novo quando tiver sinal.");
    toast.success("Viagem iniciada.");
    await carregar();
  }

  async function encerrar() {
    if (!dados) return;
    const faltam = dados.alunos.filter((a) => !a.embarcado).length;
    const texto = faltam
      ? `${faltam} aluno(s) ainda não embarcaram. Encerrar mesmo assim? Eles ficarão com falta (ou "não retornou").`
      : "Encerrar esta viagem?";
    if (!(await confirmar(texto))) return;
    setOcupado(true);
    // Envia as presenças guardadas antes de fechar.
    await enviarFila(supabase);
    setFila(pendentes(vdo).length);
    if (pendentes(vdo).length) {
      setOcupado(false);
      return toast.error("Ainda há presenças sem enviar. Espere o sinal voltar para encerrar.");
    }
    const { data, error } = await supabase.rpc("encerrar_trecho", { p_vdo: vdo });
    setOcupado(false);
    if (error) return toast.error(error.code ? mensagemErro(error) : "Sem internet. Tente de novo quando tiver sinal.");
    try {
      localStorage.removeItem(chaveCache(vdo));
    } catch {}
    if (data) {
      toast.success("Viagem encerrada. Abrindo a lista da volta.");
      router.push(`/app/motorista/viagem/${data as string}`);
    } else {
      toast.success("Viagem encerrada.");
      router.push("/app/motorista");
    }
  }

  async function marcarManual(aluno: Aluno, motivo: string) {
    setManualPara(null);
    enfileirar({ reserva_id: aluno.reserva_id, motivo, vdo });
    // Marca na tela na hora (e no que está salvo no celular).
    setDados((d) => {
      if (!d) return d;
      const novo = {
        ...d,
        alunos: d.alunos.map((a) => (a.reserva_id === aluno.reserva_id ? { ...a, embarcado: true, tipo: "manual" as const, motivo_manual: motivo } : a)),
      };
      gravarCache(vdo, novo);
      return novo;
    });
    setFila(pendentes(vdo).length);
    if (navigator.onLine) await sincronizar();
    else toast.info("Sem internet: a presença será enviada quando o sinal voltar.");
  }

  if (!dados) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-slate-500 shadow-elevada">
        <Loader2 className="size-6 animate-spin" /> Carregando a viagem…
      </div>
    );
  }

  const { trecho, alunos } = dados;
  const v = trecho.viagem;
  const embarcados = alunos.filter((a) => a.embarcado).length;
  const encerrado = !!trecho.encerrada_em;
  const pontos = agrupar(alunos);
  const previa = v?.status === "agendada" || alunos.some((a) => a.previa);

  return (
    <div className="flex flex-col gap-4 pb-28">
      {janela}
      <Link href="/app/motorista" className="flex items-center gap-1 text-sm font-medium text-azul-100">
        <ArrowLeft className="size-4" /> Minhas viagens
      </Link>

      <div className="rounded-2xl bg-white p-4 shadow-elevada">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-lg font-bold text-white">
            <Bus className="size-5" /> {trecho.onibus?.prefixo}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">
              {v ? `${SENTIDOS[v.sentido]} · ${CIDADES_CURTO[v.cidade]}` : ""}
            </p>
            <p className="truncate text-sm text-slate-500">
              {v?.nome} · saída {v ? HORA.format(new Date(v.saida_em)) : ""}
            </p>
          </div>
          {v && <Selo cor={STATUS_VIAGEM[v.status].cor}>{encerrado ? "Encerrada" : STATUS_VIAGEM[v.status].rotulo}</Selo>}
        </div>

        <div className="mt-4 flex items-end justify-between">
          <p className="text-4xl font-black tabular-nums text-slate-900">
            {previa ? alunos.length : embarcados}{" "}
            <span className="text-lg font-semibold text-slate-400">{previa ? `reservado${alunos.length === 1 ? "" : "s"} até agora` : `de ${alunos.length} embarcados`}</span>
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${alunos.length ? (embarcados / alunos.length) * 100 : 0}%` }}
          />
        </div>

        {(!online || fila > 0) && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
            <CloudOff className="size-4 shrink-0" />
            {!online ? "Sem internet. A lista salva no celular continua funcionando." : ""}
            {fila > 0 ? ` ${fila} presença(s) esperando sinal para enviar.` : ""}
          </p>
        )}
        {!emAndamento && !encerrado && v?.status === "prazo_fechado" && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
            <Navigation className="size-4 shrink-0" />
            Toque em Iniciar assim que chegar ao ponto: com a viagem iniciada, o QR só vale para quem estiver perto do ônibus.
          </p>
        )}
        {emAndamento && (
          <p
            className={cx(
              "mt-3 flex items-center gap-2 rounded-xl p-2.5 text-xs",
              gps === "erro" ? "bg-red-50 text-red-700" : "bg-azul-50 text-azul-800",
            )}
          >
            <Navigation className="size-4 shrink-0" />
            {gps === "erro"
              ? `Localização desligada: ${erroGps ?? ""} Sem ela, os alunos embarcam sem conferir a distância.`
              : "Enviando sua localização. Mantenha o app aberto durante a viagem."}
          </p>
        )}
      </div>

      {previa && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <Eye className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Lista prévia · atualiza sozinha</p>
            <p className="text-xs text-amber-800">
              Mostra quem já reservou esta viagem até agora{v?.prazo_em ? `. A reserva fecha às ${HORA.format(new Date(v.prazo_em))}` : ""}
              ; depois disso, a lista final mostra só os alunos do seu ônibus.
            </p>
          </div>
        </div>
      )}

      {alunos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-suave">
          <UserRound className="size-8 text-slate-300" />
          {previa ? "Ninguém reservou ainda. Os alunos aparecem aqui assim que reservarem." : "Nenhum aluno neste ônibus."}
        </div>
      ) : (
        pontos.map(([ponto, lista]) => (
          <section key={ponto} className="overflow-hidden rounded-2xl bg-white shadow-suave">
            <h2 className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
              <MapPin className="size-4 text-slate-400" /> {ponto}
              <span className="ml-auto text-xs font-normal text-slate-500">
                {lista.filter((a) => a.embarcado).length}/{lista.length}
              </span>
            </h2>
            <ul className="divide-y divide-slate-100">
              {lista.map((a) => (
                <li key={a.reserva_id} className={cx("flex items-center gap-3 px-4 py-3", a.embarcado && "bg-emerald-50/50")}>
                  {a.foto_path && fotos[a.foto_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fotos[a.foto_path]} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <UserRound className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{a.nome}</p>
                    {a.desembarque_nome && <p className="truncate text-xs text-slate-500">Desce: {a.desembarque_nome}</p>}
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      {a.embarcado ? (
                        a.tipo === "manual" ? (
                          <>
                            <Hand className="size-3.5" /> Manual · {a.motivo_manual}
                          </>
                        ) : (
                          <>
                            <QrCode className="size-3.5" /> Leu o QR
                          </>
                        )
                      ) : (
                        "Aguardando"
                      )}
                    </p>
                  </div>
                  {a.embarcado ? (
                    <CheckCircle2 className="size-7 shrink-0 text-emerald-500" />
                  ) : emAndamento ? (
                    <Botao variante="secundario" className="h-10 shrink-0 px-3 text-xs" onClick={() => setManualPara(a)}>
                      <Hand /> Presença
                    </Botao>
                  ) : (
                    <Circle className="size-7 shrink-0 text-slate-200" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {!encerrado && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-[#f4f6fb] via-[#f4f6fb] to-transparent p-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {emAndamento ? (
            <Botao variante="perigo" className="h-14 w-full text-base" onClick={() => void encerrar()} disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Square />} Encerrar {v?.sentido === "ida" ? "ida" : "viagem"}
            </Botao>
          ) : v?.status === "agendada" ? (
            // Lista prévia: só dá para iniciar depois que o prazo fecha e os alunos são colocados nos ônibus.
            <Botao className="h-14 w-full text-base" disabled>
              <Clock3 /> {v.prazo_em ? `Iniciar disponível após ${HORA.format(new Date(v.prazo_em))}` : "Aguardando o fechamento da lista"}
            </Botao>
          ) : (
            <Botao className="h-14 w-full text-base" onClick={() => void iniciar()} disabled={ocupado || !online}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Play />} Iniciar {v?.sentido === "volta" ? "volta" : "viagem"}
            </Botao>
          )}
        </div>
      )}

      {manualPara && <JanelaMotivo aluno={manualPara} aoFechar={() => setManualPara(null)} aoConfirmar={marcarManual} />}
    </div>
  );
}

function agrupar(alunos: Aluno[]): [string, Aluno[]][] {
  const mapa = new Map<string, Aluno[]>();
  for (const a of alunos) {
    const chave = a.ponto_nome ?? "Sem ponto definido";
    mapa.set(chave, [...(mapa.get(chave) ?? []), a]);
  }
  return [...mapa.entries()];
}

function JanelaMotivo({
  aluno,
  aoFechar,
  aoConfirmar,
}: {
  aluno: Aluno;
  aoFechar: () => void;
  aoConfirmar: (a: Aluno, motivo: string) => void;
}) {
  const [outro, setOutro] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" onClick={aoFechar}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-semibold text-slate-900">Presença manual</p>
        <p className="text-sm text-slate-500">{aluno.nome} · por que não leu o QR?</p>
        <div className="mt-4 flex flex-col gap-2">
          {MOTIVOS.map((m) => (
            <Botao key={m} variante="secundario" className="h-12 justify-start" onClick={() => aoConfirmar(aluno, m)}>
              {m}
            </Botao>
          ))}
          <div className="flex gap-2">
            <input
              value={outro}
              onChange={(e) => setOutro(e.target.value)}
              placeholder="Outro motivo"
              className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <Botao className="h-12" disabled={!outro.trim()} onClick={() => aoConfirmar(aluno, outro.trim())}>
              OK
            </Botao>
          </div>
          <button onClick={aoFechar} className="mt-1 text-sm font-medium text-slate-500">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
