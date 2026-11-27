import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronRight, Download, Filter } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Botao, Entrada, Selecao, Tabela, Titulo, Vazio, cx } from "@/components/ui";
import { CarregandoLink } from "@/components/carregando-link";
import { descreverFiltros, formatar, lerFiltros, relatoriosDo, type Linha } from "@/lib/relatorios";
import { TURNOS } from "@/lib/rotulos";

export const metadata: Metadata = { title: "Relatórios" };

const NA_TELA = 300;

/** Relatórios da secretaria logada, com filtros e exportação para Excel. */
export default async function PaginaRelatorios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPerfil("semeduc", "semtransp");
  const lista = relatoriosDo(sessao.perfil);
  const sp = await searchParams;
  const rel = lista.find((r) => r.chave === sp.r) ?? lista[0];
  const f = lerFiltros(sp);
  const supabase = await criarClienteServidor();

  const instituicoes = rel.filtros.includes("vinculo")
    ? ((await supabase.from("instituicoes").select("id, nome, cidade").order("nome")).data ?? [])
    : [];
  let linhas: Linha[] = [];
  let erro: string | null = null;
  try {
    linhas = await rel.carregar(supabase, f);
  } catch (e) {
    erro = (e as Error).message;
  }
  const totais = rel.totais && linhas.length ? rel.totais(linhas) : null;
  const params = new URLSearchParams({ r: rel.chave, de: f.de, ate: f.ate, instituicao: f.instituicao, curso: f.curso, turno: f.turno, cidade: f.cidade, dias: f.dias, uso: f.uso });

  return (
    <>
      <Titulo
        icone={BarChart3}
        descricao="Escolha o relatório, ajuste os filtros e baixe em Excel para imprimir ou mandar."
        acoes={
          !erro && (
            <a
              href={`/api/relatorios?${params}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Download className="size-4" /> Baixar Excel
            </a>
          )
        }
      >
        Relatórios
      </Titulo>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-suave">
          {lista.map((r) => (
            <Link
              key={r.chave}
              href={`/painel/relatorios?r=${r.chave}`}
              className={cx(
                "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium",
                r.chave === rel.chave ? "bg-azul-50 text-azul-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {r.titulo}
              <CarregandoLink />
              <ChevronRight className="size-4 shrink-0 opacity-50" />
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{rel.titulo}</h2>
            <p className="text-sm text-slate-500">{rel.descricao}</p>
          </div>

          {rel.filtros.length > 0 && (
            <form action="/painel/relatorios" className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-suave">
              <input type="hidden" name="r" value={rel.chave} />
              {rel.filtros.includes("periodo") && (
                <>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    De
                    <Entrada type="date" name="de" defaultValue={f.de} className="w-40" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Até
                    <Entrada type="date" name="ate" defaultValue={f.ate} className="w-40" />
                  </label>
                </>
              )}
              {rel.filtros.includes("vinculo") && (
                <>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Instituição
                    <Selecao name="instituicao" defaultValue={f.instituicao} className="w-52">
                      <option value="">Todas</option>
                      {instituicoes.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                        </option>
                      ))}
                    </Selecao>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Curso
                    <Entrada name="curso" defaultValue={f.curso} placeholder="Qualquer" className="w-40" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                    Turno
                    <Selecao name="turno" defaultValue={f.turno} className="w-32">
                      <option value="">Todos</option>
                      {Object.entries(TURNOS).map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                    </Selecao>
                  </label>
                </>
              )}
              {rel.filtros.includes("cidade") && (
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                  Cidade
                  <Selecao name="cidade" defaultValue={f.cidade} className="w-36">
                    <option value="">Todas</option>
                    <option value="campos">Campos</option>
                    <option value="itaperuna">Itaperuna</option>
                  </Selecao>
                </label>
              )}
              {rel.filtros.includes("vencimento") && (
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                  Vencendo em até
                  <Selecao name="dias" defaultValue={f.dias} className="w-36">
                    {["15", "30", "60", "90"].map((d) => (
                      <option key={d} value={d}>
                        {d} dias
                      </option>
                    ))}
                  </Selecao>
                </label>
              )}
              {rel.filtros.includes("uso") && (
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
                  Mostrar
                  <Selecao name="uso" defaultValue={f.uso} className="w-56">
                    <option value="sem_reserva">Só quem não reservou</option>
                    <option value="todos">Todos com viagens liberadas</option>
                  </Selecao>
                </label>
              )}
              <Botao type="submit" variante="secundario">
                <Filter /> Aplicar
              </Botao>
            </form>
          )}

          {erro ? (
            <Aviso tipo="erro">Não foi possível montar o relatório: {erro}</Aviso>
          ) : linhas.length === 0 ? (
            <Vazio icone={BarChart3}>Nada para mostrar com estes filtros.</Vazio>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {descreverFiltros(rel, f, instituicoes.find((i) => i.id === f.instituicao)?.nome)} · {linhas.length} linha(s)
                {linhas.length > NA_TELA && ` (a tela mostra as ${NA_TELA} primeiras; o Excel tem todas)`}
              </p>
              <Tabela>
                <thead>
                  <tr>
                    {rel.colunas.map((c) => (
                      <th key={c.chave} className={cx(c.tipo && c.tipo !== "texto" && c.tipo !== "data" && "text-right")}>
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, NA_TELA).map((l, i) => (
                    <tr key={i}>
                      {rel.colunas.map((c) => (
                        <td
                          key={c.chave}
                          className={cx(
                            "whitespace-nowrap",
                            c.tipo && c.tipo !== "texto" && c.tipo !== "data" && "text-right tabular-nums",
                            c.chave === "sobra" && Number(l[c.chave]) < 0 && "font-semibold text-red-600",
                            c.chave === "faltas" && Number(l[c.chave]) > 0 && "font-semibold text-red-600",
                          )}
                        >
                          {formatar(c, l[c.chave] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {totais && (
                    <tr className="bg-slate-50 font-semibold">
                      {rel.colunas.map((c) => (
                        <td key={c.chave} className={cx("whitespace-nowrap", c.tipo && c.tipo !== "texto" && "text-right tabular-nums")}>
                          {totais[c.chave] !== undefined ? formatar(c, totais[c.chave]) : ""}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </Tabela>
            </>
          )}
        </div>
      </div>
    </>
  );
}
