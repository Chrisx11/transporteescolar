import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Botao, Entrada, Selecao, Selo, Tabela, Titulo, Vazio } from "@/components/ui";
import { dataHoraBR, hojeSP, somarDias } from "@/lib/tempo";

export const metadata: Metadata = { title: "Auditoria" };

const POR_PAGINA = 50;

/** Nome de cada tabela para quem lê. */
const TABELAS: Record<string, string> = {
  usuarios: "Contas de acesso",
  alunos: "Alunos",
  aluno_vinculos: "Cursos do aluno",
  aluno_viagens: "Rotas liberadas",
  aluno_pontos_volta: "Pontos do aluno",
  grade_semanal: "Grade semanal",
  anotacoes_aluno: "Anotações do aluno",
  instituicoes: "Instituições",
  semestres: "Semestres",
  calendario: "Feriados e recessos",
  pre_cadastros: "Pedidos de passe",
  justificativas: "Justificativas de falta",
  excecoes: "Trocas de horário",
  frequencia: "Frequência",
  onibus: "Ônibus",
  motoristas: "Motoristas",
  pontos: "Pontos",
  viagens_modelo: "Viagens modelo",
  escala_modelo: "Escala semanal",
  parametros: "Parâmetros",
  viagens_dia: "Viagens do dia",
  viagem_dia_onibus: "Ônibus da viagem do dia",
  embarques: "Embarques",
  reservas: "Reservas",
};
const DO_PERFIL: Record<string, string[]> = {
  semeduc: ["alunos", "aluno_vinculos", "aluno_viagens", "aluno_pontos_volta", "grade_semanal", "anotacoes_aluno", "instituicoes", "semestres", "calendario", "pre_cadastros", "justificativas", "excecoes", "frequencia", "usuarios"],
  semtransp: ["onibus", "motoristas", "pontos", "viagens_modelo", "escala_modelo", "parametros", "viagens_dia", "viagem_dia_onibus", "embarques", "usuarios"],
};
const ACOES: Record<string, { rotulo: string; cor: "verde" | "azul" | "vermelho" }> = {
  INSERT: { rotulo: "Criou", cor: "verde" },
  UPDATE: { rotulo: "Alterou", cor: "azul" },
  DELETE: { rotulo: "Apagou", cor: "vermelho" },
};
// Campos técnicos que não interessam a quem lê.
const IGNORAR = new Set(["id", "criado_em", "atualizado_em", "qr_token", "lembrete_em", "alocada_em", "criada_em"]);

type Registro = {
  id: number;
  usuario_id: string | null;
  tabela: string;
  registro_id: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE";
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
};

const texto = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};

function descricao(r: Registro): string {
  const d = r.depois ?? r.antes ?? {};
  for (const k of ["nome", "prefixo", "rotulo", "chave", "descricao", "motivo", "curso"]) if (d[k]) return texto(d[k]);
  if (d.data) return `dia ${String(d.data).split("-").reverse().join("/")}`;
  return r.registro_id ? `nº ${r.registro_id.slice(0, 8)}` : "";
}

function mudancas(r: Registro): string[] {
  if (r.acao !== "UPDATE" || !r.antes || !r.depois) return [];
  return Object.keys(r.depois)
    .filter((k) => !IGNORAR.has(k) && !k.endsWith("_path") && JSON.stringify(r.antes![k]) !== JSON.stringify(r.depois![k]))
    .slice(0, 6)
    .map((k) => `${k.replace(/_/g, " ")}: ${texto(r.antes![k])} → ${texto(r.depois![k])}`);
}

/** Quem criou, alterou ou apagou cada cadastro. Admin vê tudo; cada secretaria, o que é dela. */
export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{ tabela?: string; acao?: string; de?: string; ate?: string; pessoa?: string; pagina?: string }>;
}) {
  const sessao = await exigirPerfil("semeduc", "semtransp", "admin");
  const sp = await searchParams;
  const permitidas = sessao.perfil === "admin" ? Object.keys(TABELAS) : DO_PERFIL[sessao.perfil];
  const tabela = sp.tabela && permitidas.includes(sp.tabela) ? sp.tabela : "";
  const acao = sp.acao && sp.acao in ACOES ? sp.acao : "";
  const hoje = hojeSP();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? "") ? sp.de! : somarDias(hoje, -7);
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? "") ? sp.ate! : hoje;
  const pessoa = (sp.pessoa ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60);
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const supabase = await criarClienteServidor();

  // Pessoa: nomes da equipe (secretarias, admin e motoristas) que batem com a busca.
  let ids: string[] | null = null;
  if (pessoa) {
    const { data } = await supabase.from("usuarios").select("id").ilike("nome", `%${pessoa}%`).neq("perfil", "aluno").limit(50);
    ids = (data ?? []).map((u) => u.id);
  }

  let q = supabase
    .from("auditoria")
    .select("id, usuario_id, tabela, registro_id, acao, antes, depois, criado_em", { count: "exact" })
    .gte("criado_em", `${de}T00:00:00-03:00`)
    .lte("criado_em", `${ate}T23:59:59.999-03:00`)
    .in("tabela", tabela ? [tabela] : permitidas)
    .order("criado_em", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (acao) q = q.eq("acao", acao);
  if (ids) q = ids.length ? q.in("usuario_id", ids) : q.eq("usuario_id", "00000000-0000-0000-0000-000000000000");
  const { data, count } = await q;
  const linhas = (data ?? []) as Registro[];

  // Nomes de quem fez (uma busca só).
  const autores = [...new Set(linhas.map((l) => l.usuario_id).filter((x): x is string => !!x))];
  const nomes = new Map<string, { nome: string; perfil: string }>();
  if (autores.length) {
    const { data: us } = await supabase.from("usuarios").select("id, nome, perfil").in("id", autores);
    us?.forEach((u) => nomes.set(u.id, { nome: u.nome, perfil: u.perfil }));
  }
  const paginas = Math.max(1, Math.ceil((count ?? 0) / POR_PAGINA));
  const link = (mudar: Record<string, string>) => `/painel/auditoria?${new URLSearchParams({ tabela, acao, de, ate, pessoa, ...mudar })}`;

  return (
    <>
      <Titulo
        icone={History}
        descricao={
          sessao.perfil === "admin"
            ? "Tudo o que foi criado, alterado ou apagado no sistema, com quem fez e quando."
            : "O que foi criado, alterado ou apagado nos cadastros da sua secretaria, com quem fez e quando."
        }
      >
        Auditoria
      </Titulo>

      <form action="/painel/auditoria" className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-suave">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Cadastro
          <Selecao name="tabela" defaultValue={tabela} className="w-52">
            <option value="">Todos</option>
            {permitidas.map((t) => (
              <option key={t} value={t}>
                {TABELAS[t]}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Ação
          <Selecao name="acao" defaultValue={acao} className="w-32">
            <option value="">Todas</option>
            {Object.entries(ACOES).map(([v, a]) => (
              <option key={v} value={v}>
                {a.rotulo}
              </option>
            ))}
          </Selecao>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          De
          <Entrada type="date" name="de" defaultValue={de} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Até
          <Entrada type="date" name="ate" defaultValue={ate} className="w-40" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Quem fez
          <Entrada name="pessoa" defaultValue={pessoa} placeholder="Nome de quem fez" className="min-w-40" />
        </label>
        <Botao type="submit" variante="secundario">
          <Search /> Filtrar
        </Botao>
      </form>

      {linhas.length === 0 ? (
        <Vazio icone={History}>Nenhuma alteração neste filtro.</Vazio>
      ) : (
        <>
          <Tabela>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O quê</th>
                <th>Mudanças</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const autor = l.usuario_id ? nomes.get(l.usuario_id) : null;
                const m = mudancas(l);
                return (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs text-slate-600">{dataHoraBR(l.criado_em)}</td>
                    <td className="text-sm">
                      {autor ? (
                        <>
                          <span className="font-medium">{autor.nome}</span>
                          <span className="block text-xs text-slate-500">{autor.perfil === "semeduc" ? "SEMEDUC" : autor.perfil === "semtransp" ? "SEMTRANSP" : autor.perfil === "admin" ? "Administração" : autor.perfil === "motorista" ? "Motorista" : "Aluno"}</span>
                        </>
                      ) : (
                        <span className="text-slate-500">Sistema (automático)</span>
                      )}
                    </td>
                    <td className="text-sm">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Selo cor={ACOES[l.acao].cor}>{ACOES[l.acao].rotulo}</Selo>
                        <span className="font-medium">{TABELAS[l.tabela] ?? l.tabela}</span>
                      </span>
                      <span className="block text-xs text-slate-500">{descricao(l)}</span>
                    </td>
                    <td className="max-w-md text-xs text-slate-600">
                      {m.length ? (
                        <ul className="flex flex-col gap-0.5">
                          {m.map((x) => (
                            <li key={x} className="break-words">
                              {x}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              {count ?? 0} registro(s) · página {pagina} de {paginas}
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
