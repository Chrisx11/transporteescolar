import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Hourglass, Search, ShieldCheck, UserX } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Botao, Entrada, Estatistica, Selecao, Selo, Tabela, Titulo, Vazio, cx } from "@/components/ui";
import { CarregandoLink } from "@/components/carregando-link";
import { hojeSP, somarDias } from "@/lib/tempo";

export const metadata: Metadata = { title: "Faltas" };

const POR_PAGINA = 50;
const CIDADE: Record<string, string> = { campos: "Campos", itaperuna: "Itaperuna" };
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

const SITUACOES = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "nao_justificadas", rotulo: "Não justificadas" },
  { chave: "em_analise", rotulo: "Justificativa em análise" },
  { chave: "justificadas", rotulo: "Justificadas" },
] as const;
type Situacao = (typeof SITUACOES)[number]["chave"];

type Linha = {
  id: number;
  resultado: "falta" | "justificada";
  aluno: { usuario_id: string; usuario: { nome: string; cpf: string } };
  viagem: { data: string; nome: string; cidade: string; sentido: string; saida_em: string };
  justificativas: { status: string; criado_em: string }[];
};

const dataValida = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

/** Faltas lançadas (justificadas ou não), para a SEMEDUC e a SEMTRANSP. */
export default async function PaginaFaltas({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; de?: string; ate?: string; q?: string; cidade?: string; pagina?: string }>;
}) {
  const sessao = await exigirPerfil("semeduc", "semtransp");
  const educacao = sessao.perfil === "semeduc";
  const sp = await searchParams;
  const situacao: Situacao = SITUACOES.some((s) => s.chave === sp.situacao) ? (sp.situacao as Situacao) : "todas";
  const hoje = hojeSP();
  const ate = dataValida(sp.ate) ?? hoje;
  const de = dataValida(sp.de) ?? somarDias(hoje, -30);
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60);
  const cidade = sp.cidade === "campos" || sp.cidade === "itaperuna" ? sp.cidade : "";
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const supabase = await criarClienteServidor();

  // "Em análise" precisa de uma justificativa pendente; nas outras, as justificativas vêm junto (se houver).
  const just = situacao === "em_analise" ? "justificativas!inner(status, criado_em)" : "justificativas(status, criado_em)";
  let consulta = supabase
    .from("frequencia")
    .select(
      `id, resultado, aluno:alunos!inner(usuario_id, usuario:usuarios!inner(nome, cpf)), viagem:viagens_dia!inner(data, nome, cidade, sentido, saida_em), ${just}`,
      { count: "exact" },
    )
    .gte("viagem.data", de)
    .lte("viagem.data", ate)
    .order("lancada_em", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (situacao === "nao_justificadas" || situacao === "em_analise") consulta = consulta.eq("resultado", "falta");
  else if (situacao === "justificadas") consulta = consulta.eq("resultado", "justificada");
  else consulta = consulta.in("resultado", ["falta", "justificada"]);
  if (situacao === "em_analise") consulta = consulta.eq("justificativas.status", "pendente");
  if (cidade) consulta = consulta.eq("viagem.cidade", cidade);
  if (q) consulta = consulta.ilike("aluno.usuario.nome", `%${q}%`);

  // Totais do período (com a cidade escolhida).
  const total = (resultado: string) => {
    let c = supabase
      .from("frequencia")
      .select("id, viagem:viagens_dia!inner(data, cidade)", { count: "exact", head: true })
      .eq("resultado", resultado)
      .gte("viagem.data", de)
      .lte("viagem.data", ate);
    if (cidade) c = c.eq("viagem.cidade", cidade);
    return c;
  };
  let emAnalise = supabase
    .from("frequencia")
    .select("id, viagem:viagens_dia!inner(data, cidade), justificativas!inner(status)", { count: "exact", head: true })
    .eq("resultado", "falta")
    .eq("justificativas.status", "pendente")
    .gte("viagem.data", de)
    .lte("viagem.data", ate);
  if (cidade) emAnalise = emAnalise.eq("viagem.cidade", cidade);

  const [{ data, count }, { count: nFaltas }, { count: nJustificadas }, { count: nAnalise }] = await Promise.all([
    consulta,
    total("falta"),
    total("justificada"),
    emAnalise,
  ]);
  const linhas = (data ?? []) as unknown as Linha[];
  const paginas = Math.max(1, Math.ceil((count ?? 0) / POR_PAGINA));
  const link = (mudar: Record<string, string>) =>
    `/painel/faltas?${new URLSearchParams({ situacao, de, ate, q, cidade, ...mudar })}`;

  return (
    <>
      <Titulo
        icone={UserX}
        descricao={
          educacao
            ? "Faltas lançadas ao encerrar as viagens. As justificativas enviadas pelos alunos são analisadas em Justificativas e trocas."
            : "Faltas lançadas ao encerrar as viagens, justificadas ou não. A análise das justificativas é feita pela Secretaria de Educação."
        }
      >
        Faltas
      </Titulo>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link href={link({ situacao: "nao_justificadas", pagina: "1" })}>
          <Estatistica rotulo="Não justificadas" valor={nFaltas ?? 0} icone={UserX} cor="rosa" detalhe="No período escolhido" />
        </Link>
        <Link href={link({ situacao: "em_analise", pagina: "1" })}>
          <Estatistica rotulo="Justificativa em análise" valor={nAnalise ?? 0} icone={Hourglass} cor="amarelo" detalhe="Aguardando a Educação" />
        </Link>
        <Link href={link({ situacao: "justificadas", pagina: "1" })}>
          <Estatistica rotulo="Justificadas" valor={nJustificadas ?? 0} icone={ShieldCheck} cor="azul" detalhe="No período escolhido" />
        </Link>
      </div>

      <div className="mb-4 inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
        {SITUACOES.map((s) => (
          <Link
            key={s.chave}
            href={link({ situacao: s.chave, pagina: "1" })}
            className={cx("rounded-lg px-3.5 py-1.5 text-sm font-medium", s.chave === situacao ? "bg-white text-azul-800 shadow-sm" : "text-slate-600 hover:text-slate-900")}
          >
            {s.rotulo}
            <CarregandoLink />
          </Link>
        ))}
      </div>

      <form action="/painel/faltas" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="situacao" value={situacao} />
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          De
          <Entrada type="date" name="de" defaultValue={de} max={hoje} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Até
          <Entrada type="date" name="ate" defaultValue={ate} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Cidade
          <Selecao name="cidade" defaultValue={cidade} className="w-36">
            <option value="">Todas</option>
            <option value="campos">Campos</option>
            <option value="itaperuna">Itaperuna</option>
          </Selecao>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Aluno
          <Entrada name="q" defaultValue={q} placeholder="Buscar pelo nome" className="min-w-48" />
        </label>
        <Botao type="submit" variante="secundario">
          <Search /> Filtrar
        </Botao>
      </form>

      {linhas.length === 0 ? (
        <Vazio icone={UserX}>Nenhuma falta neste filtro.</Vazio>
      ) : (
        <>
          <Tabela>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Viagem</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const pendente = l.justificativas?.some((j) => j.status === "pendente");
                const recusada = l.resultado === "falta" && !pendente && l.justificativas?.some((j) => j.status === "recusada");
                return (
                  <tr key={l.id}>
                    <td>
                      {educacao ? (
                        <Link href={`/painel/alunos/${l.aluno.usuario_id}`} className="font-medium hover:text-azul-700 hover:underline">
                          {l.aluno.usuario.nome}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.aluno.usuario.nome}</span>
                      )}
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        {l.viagem.sentido === "ida" ? <ArrowUpRight className="size-4 text-azul-600" /> : <ArrowDownLeft className="size-4 text-violet-600" />}
                        {l.viagem.nome} · {CIDADE[l.viagem.cidade]}
                      </span>
                      <span className="text-xs text-slate-500">
                        {DATA.format(new Date(l.viagem.data + "T12:00:00Z"))} às {HORA.format(new Date(l.viagem.saida_em))}
                      </span>
                    </td>
                    <td>
                      {l.resultado === "justificada" ? (
                        <Selo cor="azul">Justificada</Selo>
                      ) : pendente ? (
                        educacao ? (
                          <Link href="/painel/solicitacoes">
                            <Selo cor="amarelo">Justificativa em análise</Selo>
                          </Link>
                        ) : (
                          <Selo cor="amarelo">Justificativa em análise</Selo>
                        )
                      ) : (
                        <Selo cor="vermelho">{recusada ? "Não justificada (recusada)" : "Não justificada"}</Selo>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              {count ?? 0} falta(s) · página {pagina} de {paginas}
            </span>
            <div className="flex gap-2">
              {pagina > 1 && (
                <Link href={link({ pagina: String(pagina - 1) })} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">
                  <ChevronLeft className="size-4" /> Anterior
                </Link>
              )}
              {pagina < paginas && (
                <Link href={link({ pagina: String(pagina + 1) })} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">
                  Próxima <ChevronRight className="size-4" />
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
