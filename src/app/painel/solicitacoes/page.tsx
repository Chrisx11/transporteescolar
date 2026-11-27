import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, FileCheck2, Inbox, Paperclip, Repeat2, X } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { Entrada, Selo, Titulo, Vazio, cx } from "@/components/ui";
import { CarregandoLink } from "@/components/carregando-link";
import { dataHoraBR } from "@/lib/tempo";
import { analisarExcecao, analisarJustificativa } from "./acoes";

export const metadata: Metadata = { title: "Justificativas e trocas" };

type Aluno = { usuario_id: string; usuario: { nome: string } } | null;
type Justificativa = {
  id: string;
  motivo: string;
  anexo_path: string | null;
  status: string;
  resposta: string | null;
  criado_em: string;
  analisado_em: string | null;
  aluno: Aluno;
  frequencia: { viagem: { data: string; nome: string; cidade: string; saida_em: string } | null } | null;
};
type ViagemModelo = { nome: string; cidade: string; hora_saida: string } | null;
type Excecao = {
  id: string;
  data: string;
  motivo: string;
  status: string;
  resposta: string | null;
  criado_em: string;
  analisado_em: string | null;
  aluno: Aluno;
  ida: ViagemModelo;
  volta: ViagemModelo;
};

const CIDADE: Record<string, string> = { campos: "Campos", itaperuna: "Itaperuna" };
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const dataCurta = (d: string) => DATA.format(new Date(d + "T12:00:00Z"));
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const SITUACAO: Record<string, { rotulo: string; cor: "amarelo" | "verde" | "vermelho" | "cinza" }> = {
  pendente: { rotulo: "Em análise", cor: "amarelo" },
  aprovada: { rotulo: "Aprovada", cor: "verde" },
  recusada: { rotulo: "Recusada", cor: "vermelho" },
  cancelada: { rotulo: "Cancelada pelo aluno", cor: "cinza" },
};

function Decisao({ id, acao, rotuloAprovar }: { id: string; acao: typeof analisarJustificativa; rotuloAprovar: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2 border-t border-slate-100 pt-3">
      <AcaoRapida acao={acao} campos={{ id, aprovar: "sim" }} rotulo={rotuloAprovar} variante="primario" icone={<Check />} />
      <Formulario acao={acao} className="flex-1 !flex-row !gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="aprovar" value="nao" />
        <Entrada name="resposta" placeholder="Motivo da recusa (o aluno vê)" className="h-8 min-w-48 flex-1 text-xs" required />
        <BotaoEnviar variante="perigo" className="h-8 rounded-lg px-2.5 text-xs">
          <X className="size-3.5" /> Recusar
        </BotaoEnviar>
      </Formulario>
    </div>
  );
}

function NomeAluno({ aluno }: { aluno: Aluno }) {
  if (!aluno) return <span className="font-semibold text-slate-900">Aluno</span>;
  return (
    <Link href={`/painel/alunos/${aluno.usuario_id}`} className="font-semibold text-slate-900 hover:text-azul-700 hover:underline">
      {aluno.usuario.nome}
    </Link>
  );
}

/** SEMEDUC: justificativas de falta (RN17) e pedidos de troca de horário (RN19). */
export default async function PaginaSolicitacoes({ searchParams }: { searchParams: Promise<{ aba?: string; ver?: string }> }) {
  await exigirPerfil("semeduc");
  const sp = await searchParams;
  const aba = sp.aba === "trocas" ? "trocas" : "justificativas";
  const ver = sp.ver === "analisadas" ? "analisadas" : "pendentes";
  const supabase = await criarClienteServidor();

  const contar = (tabela: string) => supabase.from(tabela).select("id", { count: "exact", head: true }).eq("status", "pendente");
  const [{ count: pJust }, { count: pTroca }] = await Promise.all([contar("justificativas"), contar("excecoes")]);

  let justificativas: Justificativa[] = [];
  let excecoes: Excecao[] = [];
  const links: Record<string, string> = {};
  if (aba === "justificativas") {
    let q = supabase
      .from("justificativas")
      .select(
        "id, motivo, anexo_path, status, resposta, criado_em, analisado_em, aluno:alunos(usuario_id, usuario:usuarios(nome)), frequencia:frequencia(viagem:viagens_dia(data, nome, cidade, saida_em))",
      )
      .limit(100);
    q = ver === "pendentes" ? q.eq("status", "pendente").order("criado_em") : q.neq("status", "pendente").order("analisado_em", { ascending: false });
    justificativas = ((await q).data ?? []) as unknown as Justificativa[];
    const anexos = justificativas.map((j) => j.anexo_path).filter((x): x is string => !!x);
    if (anexos.length) {
      const { data } = await supabase.storage.from("documentos").createSignedUrls(anexos, 3600);
      data?.forEach((a) => {
        if (a.path && a.signedUrl) links[a.path] = a.signedUrl;
      });
    }
  } else {
    let q = supabase
      .from("excecoes")
      .select(
        "id, data, motivo, status, resposta, criado_em, analisado_em, aluno:alunos(usuario_id, usuario:usuarios(nome)), ida:viagens_modelo!excecoes_viagem_ida_modelo_id_fkey(nome, cidade, hora_saida), volta:viagens_modelo!excecoes_viagem_volta_modelo_id_fkey(nome, cidade, hora_saida)",
      )
      .limit(100);
    q = ver === "pendentes" ? q.eq("status", "pendente").order("data") : q.neq("status", "pendente").order("criado_em", { ascending: false });
    excecoes = ((await q).data ?? []) as unknown as Excecao[];
  }

  const url = (a: string, v: string) => `/painel/solicitacoes?${new URLSearchParams({ aba: a, ver: v })}`;
  const ABAS = [
    { chave: "justificativas", rotulo: "Justificativas de falta", icone: FileCheck2, pendentes: pJust ?? 0 },
    { chave: "trocas", rotulo: "Trocas de horário", icone: Repeat2, pendentes: pTroca ?? 0 },
  ];

  return (
    <>
      <Titulo
        icone={Inbox}
        descricao="Pedidos feitos pelos alunos no app. Aprovada, a falta vira justificada (ou a troca de horário passa a valer naquele dia) e o aluno é avisado no celular."
      >
        Justificativas e trocas
      </Titulo>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={url(a.chave, ver)}
              className={cx("flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium", a.chave === aba ? "bg-white text-azul-800 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <a.icone className="size-4" /> {a.rotulo}
              {a.pendentes > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{a.pendentes}</span>}
              <CarregandoLink />
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          {[
            { chave: "pendentes", rotulo: "Para analisar" },
            { chave: "analisadas", rotulo: "Já analisadas" },
          ].map((v) => (
            <Link
              key={v.chave}
              href={url(aba, v.chave)}
              className={cx("rounded-lg px-3 py-1.5 font-medium", v.chave === ver ? "bg-white text-azul-800 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              {v.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {aba === "justificativas" &&
        (justificativas.length === 0 ? (
          <Vazio icone={FileCheck2}>{ver === "pendentes" ? "Nenhuma justificativa esperando análise." : "Nenhuma justificativa analisada ainda."}</Vazio>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {justificativas.map((j) => {
              const v = j.frequencia?.viagem;
              const s = SITUACAO[j.status] ?? SITUACAO.pendente;
              return (
                <div key={j.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-suave">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <NomeAluno aluno={j.aluno} />
                      {v && (
                        <p className="text-sm text-slate-500">
                          Faltou: {v.nome} · {CIDADE[v.cidade]} · {dataCurta(v.data)} às {HORA.format(new Date(v.saida_em))}
                        </p>
                      )}
                    </div>
                    <Selo cor={s.cor}>{s.rotulo}</Selo>
                  </div>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">“{j.motivo}”</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Enviada em {dataHoraBR(j.criado_em)}</span>
                    {j.anexo_path && links[j.anexo_path] ? (
                      <a href={links[j.anexo_path]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-azul-700 hover:underline">
                        <Paperclip className="size-3.5" /> Ver anexo
                      </a>
                    ) : (
                      <span>Sem anexo</span>
                    )}
                  </div>
                  {j.resposta && <p className="text-xs text-slate-500">Resposta: {j.resposta}</p>}
                  {j.status === "pendente" && <Decisao id={j.id} acao={analisarJustificativa} rotuloAprovar="Aprovar (falta justificada)" />}
                </div>
              );
            })}
          </div>
        ))}

      {aba === "trocas" &&
        (excecoes.length === 0 ? (
          <Vazio icone={Repeat2}>{ver === "pendentes" ? "Nenhum pedido de troca esperando análise." : "Nenhum pedido analisado ainda."}</Vazio>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {excecoes.map((x) => {
              const s = SITUACAO[x.status] ?? SITUACAO.pendente;
              return (
                <div key={x.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-suave">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <NomeAluno aluno={x.aluno} />
                      <p className="text-sm text-slate-500">Para {dataCurta(x.data)}</p>
                    </div>
                    <Selo cor={s.cor}>{s.rotulo}</Selo>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-slate-700">
                    {x.ida && (
                      <p className="flex items-center gap-2">
                        <ArrowUpRight className="size-4 text-azul-600" /> Ida: {CIDADE[x.ida.cidade]} · {x.ida.nome} ({x.ida.hora_saida.slice(0, 5)})
                      </p>
                    )}
                    {x.volta && (
                      <p className="flex items-center gap-2">
                        <ArrowDownLeft className="size-4 text-violet-600" /> Volta: {CIDADE[x.volta.cidade]} · {x.volta.nome} ({x.volta.hora_saida.slice(0, 5)})
                      </p>
                    )}
                  </div>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">“{x.motivo}”</p>
                  <p className="text-xs text-slate-500">Pedido em {dataHoraBR(x.criado_em)}</p>
                  {x.resposta && <p className="text-xs text-slate-500">Resposta: {x.resposta}</p>}
                  {x.status === "pendente" && <Decisao id={x.id} acao={analisarExcecao} rotuloAprovar="Aprovar troca" />}
                </div>
              );
            })}
          </div>
        ))}
    </>
  );
}
