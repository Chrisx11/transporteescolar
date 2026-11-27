import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarCpf } from "@/lib/cpf";
import { DIAS_SEMANA, hojeSP, somarDias } from "@/lib/tempo";
import { CIDADES_CURTO, TURNOS, type Cidade } from "@/lib/rotulos";

/**
 * Relatórios das secretarias (Fase 6). A mesma definição serve para a tabela na
 * tela e para o arquivo Excel: colunas, filtros e como buscar as linhas.
 */

export type TipoColuna = "texto" | "numero" | "decimal" | "perc" | "data";
export type Coluna = { chave: string; rotulo: string; tipo?: TipoColuna; largura?: number };
export type Linha = Record<string, string | number | null>;
export type TipoFiltro = "periodo" | "vinculo" | "cidade" | "vencimento" | "uso";

export type Filtros = {
  de: string;
  ate: string;
  instituicao: string;
  curso: string;
  turno: string;
  cidade: string;
  dias: string;
  uso: string;
};

export type Relatorio = {
  chave: string;
  titulo: string;
  descricao: string;
  perfil: "semeduc" | "semtransp";
  filtros: TipoFiltro[];
  colunas: Coluna[];
  carregar: (supabase: SupabaseClient, f: Filtros) => Promise<Linha[]>;
  /** Linha de totais (opcional), com as mesmas chaves das colunas. */
  totais?: (linhas: Linha[]) => Linha;
};

const dataValida = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);

/** Lê os filtros da URL, com padrões seguros (últimos 30 dias). */
export function lerFiltros(sp: Record<string, string | undefined>): Filtros {
  const hoje = hojeSP();
  return {
    de: dataValida(sp.de) ?? somarDias(hoje, -30),
    ate: dataValida(sp.ate) ?? hoje,
    instituicao: uuid(sp.instituicao ?? "") ?? "",
    curso: (sp.curso ?? "").trim().replace(/[%_,()]/g, "").slice(0, 60),
    turno: sp.turno && sp.turno in TURNOS ? sp.turno : "",
    cidade: sp.cidade === "campos" || sp.cidade === "itaperuna" ? sp.cidade : "",
    dias: ["15", "30", "60", "90"].includes(sp.dias ?? "") ? sp.dias! : "30",
    uso: sp.uso === "todos" ? "todos" : "sem_reserva",
  };
}

const cidade = (c: unknown) => CIDADES_CURTO[c as Cidade] ?? String(c ?? "");
const sentido = (s: unknown) => (s === "ida" ? "Ida" : s === "volta" ? "Volta" : String(s ?? ""));
const diaSemana = (d: unknown) => DIAS_SEMANA.find((x) => x.valor === Number(d))?.nome ?? String(d ?? "");
const hora = (h: unknown) => String(h ?? "").slice(0, 5);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

async function rpc(supabase: SupabaseClient, nome: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

function argsVinculo(f: Filtros) {
  return { p_de: f.de, p_ate: f.ate, p_instituicao: f.instituicao || null, p_curso: f.curso || null, p_turno: f.turno || null };
}

const COLS_ALUNO: Coluna[] = [
  { chave: "nome", rotulo: "Aluno", largura: 34 },
  { chave: "cpf", rotulo: "CPF", largura: 16 },
  { chave: "telefone", rotulo: "Telefone", largura: 17 },
];

export const RELATORIOS: Relatorio[] = [
  // ------------------------------------------------------------------ SEMEDUC
  {
    chave: "alunos",
    titulo: "Alunos ativos",
    descricao: "Alunos ativos por instituição, curso e turno (um aluno com dois cursos aparece duas vezes).",
    perfil: "semeduc",
    filtros: ["vinculo"],
    colunas: [
      ...COLS_ALUNO,
      { chave: "instituicao", rotulo: "Instituição", largura: 28 },
      { chave: "cidade", rotulo: "Cidade", largura: 12 },
      { chave: "curso", rotulo: "Curso", largura: 26 },
      { chave: "periodo", rotulo: "Período", largura: 10 },
      { chave: "turno", rotulo: "Turno", largura: 10 },
      { chave: "matricula", rotulo: "Matrícula válida até", tipo: "data", largura: 14 },
    ],
    async carregar(supabase, f) {
      let q = supabase
        .from("aluno_vinculos")
        .select(
          "curso, periodo, turno, instituicao:instituicoes!inner(id, nome, cidade), aluno:alunos!inner(situacao, matricula_validade, usuario:usuarios!inner(nome, cpf, telefone))",
        )
        .eq("aluno.situacao", "ativo")
        .limit(5000);
      if (f.instituicao) q = q.eq("instituicao.id", f.instituicao);
      if (f.curso) q = q.ilike("curso", `%${f.curso}%`);
      if (f.turno) q = q.eq("turno", f.turno);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      type V = {
        curso: string;
        periodo: string | null;
        turno: keyof typeof TURNOS;
        instituicao: { nome: string; cidade: string };
        aluno: { matricula_validade: string | null; usuario: { nome: string; cpf: string; telefone: string | null } };
      };
      return ((data ?? []) as unknown as V[])
        .map((v) => ({
          nome: v.aluno.usuario.nome,
          cpf: formatarCpf(v.aluno.usuario.cpf),
          telefone: v.aluno.usuario.telefone,
          instituicao: v.instituicao.nome,
          cidade: cidade(v.instituicao.cidade),
          curso: v.curso,
          periodo: v.periodo,
          turno: TURNOS[v.turno] ?? v.turno,
          matricula: v.aluno.matricula_validade,
        }))
        .sort((a, b) => a.instituicao.localeCompare(b.instituicao, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
    },
  },
  {
    chave: "frequencia",
    titulo: "Faltas por aluno (ranking)",
    descricao: "Viagens, embarques, faltas, faltas justificadas e \"não retornou\" de cada aluno no período. Quem mais faltou aparece primeiro.",
    perfil: "semeduc",
    filtros: ["periodo", "vinculo"],
    colunas: [
      ...COLS_ALUNO,
      { chave: "viagens", rotulo: "Viagens", tipo: "numero", largura: 9 },
      { chave: "presencas", rotulo: "Embarques", tipo: "numero", largura: 10 },
      { chave: "faltas", rotulo: "Faltas", tipo: "numero", largura: 8 },
      { chave: "justificadas", rotulo: "Justificadas", tipo: "numero", largura: 12 },
      { chave: "nao_retornou", rotulo: "Não retornou", tipo: "numero", largura: 12 },
      { chave: "perc_faltas", rotulo: "% de faltas", tipo: "perc", largura: 11 },
    ],
    async carregar(supabase, f) {
      return (await rpc(supabase, "relatorio_frequencia", argsVinculo(f))).map((r) => ({
        nome: r.nome as string,
        cpf: formatarCpf(String(r.cpf)),
        telefone: r.telefone as string | null,
        viagens: num(r.viagens),
        presencas: num(r.presencas),
        faltas: num(r.faltas),
        justificadas: num(r.justificadas),
        nao_retornou: num(r.nao_retornou),
        perc_faltas: num(r.perc_faltas),
      }));
    },
  },
  {
    chave: "matriculas",
    titulo: "Matrículas vencendo",
    descricao: "Alunos ativos com o comprovante de matrícula vencido, sem validade ou vencendo nos próximos dias. Vencida, o aluno não consegue reservar.",
    perfil: "semeduc",
    filtros: ["vencimento"],
    colunas: [
      ...COLS_ALUNO,
      { chave: "email", rotulo: "E-mail", largura: 28 },
      { chave: "validade", rotulo: "Válida até", tipo: "data", largura: 12 },
      { chave: "situacao", rotulo: "Situação", largura: 22 },
    ],
    async carregar(supabase, f) {
      const hoje = hojeSP();
      const limite = somarDias(hoje, Number(f.dias));
      const { data, error } = await supabase
        .from("alunos")
        .select("matricula_validade, usuario:usuarios!inner(nome, cpf, telefone, email)")
        .eq("situacao", "ativo")
        .or(`matricula_validade.lte.${limite},matricula_validade.is.null`)
        .order("matricula_validade", { ascending: true, nullsFirst: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      type A = { matricula_validade: string | null; usuario: { nome: string; cpf: string; telefone: string | null; email: string | null } };
      const dias = (d: string) => Math.round((Date.parse(d) - Date.parse(hoje)) / 86_400_000);
      return ((data ?? []) as unknown as A[]).map((a) => ({
        nome: a.usuario.nome,
        cpf: formatarCpf(a.usuario.cpf),
        telefone: a.usuario.telefone,
        email: a.usuario.email?.endsWith("@login.italva.invalid") ? null : a.usuario.email,
        validade: a.matricula_validade,
        situacao: !a.matricula_validade
          ? "Sem validade cadastrada"
          : dias(a.matricula_validade) < 0
            ? `Vencida há ${-dias(a.matricula_validade)} dia(s)`
            : dias(a.matricula_validade) === 0
              ? "Vence hoje"
              : `Vence em ${dias(a.matricula_validade)} dia(s)`,
      }));
    },
  },
  {
    chave: "uso",
    titulo: "Uso real × rotas liberadas",
    descricao: "Alunos ativos com viagens liberadas e quantas reservas fizeram no período. Ajuda a achar quem nunca usa o transporte.",
    perfil: "semeduc",
    filtros: ["periodo", "vinculo", "uso"],
    colunas: [
      ...COLS_ALUNO,
      { chave: "rotas", rotulo: "Viagens liberadas", tipo: "numero", largura: 14 },
      { chave: "reservas", rotulo: "Reservas no período", tipo: "numero", largura: 16 },
      { chave: "ultima", rotulo: "Última viagem", tipo: "data", largura: 13 },
    ],
    async carregar(supabase, f) {
      return (await rpc(supabase, "relatorio_uso", argsVinculo(f)))
        .filter((r) => Number(r.rotas) > 0 && (f.uso === "todos" || Number(r.reservas) === 0))
        .map((r) => ({
          nome: r.nome as string,
          cpf: formatarCpf(String(r.cpf)),
          telefone: r.telefone as string | null,
          rotas: num(r.rotas),
          reservas: num(r.reservas),
          ultima: (r.ultima_viagem as string | null) ?? null,
        }));
    },
  },

  // ---------------------------------------------------------------- SEMTRANSP
  {
    chave: "ocupacao",
    titulo: "Ocupação média por viagem",
    descricao: "Média de reservados, embarcados e lugares por viagem e dia da semana, nas viagens que já saíram no período.",
    perfil: "semtransp",
    filtros: ["periodo", "cidade"],
    colunas: [
      { chave: "cidade", rotulo: "Cidade", largura: 11 },
      { chave: "viagem", rotulo: "Viagem", largura: 16 },
      { chave: "sentido", rotulo: "Sentido", largura: 8 },
      { chave: "hora", rotulo: "Saída", largura: 7 },
      { chave: "dia", rotulo: "Dia", largura: 10 },
      { chave: "viagens", rotulo: "Viagens", tipo: "numero", largura: 9 },
      { chave: "reservas", rotulo: "Média reservados", tipo: "decimal", largura: 14 },
      { chave: "embarcados", rotulo: "Média embarcados", tipo: "decimal", largura: 15 },
      { chave: "capacidade", rotulo: "Média de lugares", tipo: "decimal", largura: 14 },
      { chave: "ocupacao", rotulo: "Ocupação (embarcados)", tipo: "perc", largura: 18 },
    ],
    async carregar(supabase, f) {
      return (await rpc(supabase, "relatorio_ocupacao", { p_de: f.de, p_ate: f.ate, p_cidade: f.cidade || null })).map((r) => ({
        cidade: cidade(r.cidade),
        viagem: r.viagem as string,
        sentido: sentido(r.sentido),
        hora: hora(r.hora_saida),
        dia: diaSemana(r.dia_semana),
        viagens: num(r.viagens),
        reservas: num(r.media_reservas),
        embarcados: num(r.media_embarcados),
        capacidade: num(r.media_capacidade),
        ocupacao: num(r.ocupacao),
      }));
    },
  },
  {
    chave: "previsao",
    titulo: "Previsão de lotação",
    descricao: "Para cada viagem e dia da semana: quantos alunos ativos têm a viagem liberada e quantos lugares a escala semanal coloca. Sobra negativa = faltam lugares se todos forem.",
    perfil: "semtransp",
    filtros: ["cidade"],
    colunas: [
      { chave: "cidade", rotulo: "Cidade", largura: 11 },
      { chave: "viagem", rotulo: "Viagem", largura: 16 },
      { chave: "sentido", rotulo: "Sentido", largura: 8 },
      { chave: "hora", rotulo: "Saída", largura: 7 },
      { chave: "dia", rotulo: "Dia", largura: 10 },
      { chave: "alunos", rotulo: "Alunos com a viagem", tipo: "numero", largura: 17 },
      { chave: "capacidade", rotulo: "Lugares na escala", tipo: "numero", largura: 15 },
      { chave: "sobra", rotulo: "Sobra de lugares", tipo: "numero", largura: 15 },
    ],
    async carregar(supabase, f) {
      return (await rpc(supabase, "relatorio_previsao", { p_cidade: f.cidade || null })).map((r) => ({
        cidade: cidade(r.cidade),
        viagem: r.viagem as string,
        sentido: sentido(r.sentido),
        hora: hora(r.hora_saida),
        dia: diaSemana(r.dia_semana),
        alunos: num(r.alunos),
        capacidade: num(r.capacidade),
        sobra: Number(r.capacidade) - Number(r.alunos),
      }));
    },
  },
  {
    chave: "km",
    titulo: "Km rodado estimado",
    descricao: "Cada ônibus que fez a viagem no período × km da viagem, mais o km do retorno vazio (cadastrados em Viagens modelo).",
    perfil: "semtransp",
    filtros: ["periodo", "cidade"],
    colunas: [
      { chave: "cidade", rotulo: "Cidade", largura: 11 },
      { chave: "viagem", rotulo: "Viagem", largura: 16 },
      { chave: "sentido", rotulo: "Sentido", largura: 8 },
      { chave: "hora", rotulo: "Saída", largura: 7 },
      { chave: "realizadas", rotulo: "Ônibus-viagens", tipo: "numero", largura: 13 },
      { chave: "km_viagem", rotulo: "Km da viagem", tipo: "decimal", largura: 12 },
      { chave: "km_vazio", rotulo: "Km retorno vazio", tipo: "decimal", largura: 15 },
      { chave: "km_total", rotulo: "Km total", tipo: "decimal", largura: 11 },
    ],
    async carregar(supabase, f) {
      return (await rpc(supabase, "relatorio_km", { p_de: f.de, p_ate: f.ate, p_cidade: f.cidade || null })).map((r) => ({
        cidade: cidade(r.cidade),
        viagem: r.viagem as string,
        sentido: sentido(r.sentido),
        hora: hora(r.hora_saida),
        realizadas: num(r.realizadas),
        km_viagem: num(r.km_viagem),
        km_vazio: num(r.km_vazio),
        km_total: num(r.km_total),
      }));
    },
    totais: (linhas) => ({
      cidade: "Total",
      realizadas: linhas.reduce((s, l) => s + Number(l.realizadas ?? 0), 0),
      km_total: Math.round(linhas.reduce((s, l) => s + Number(l.km_total ?? 0), 0) * 10) / 10,
    }),
  },
  {
    chave: "vencimentos",
    titulo: "Vencimentos da frota",
    descricao: "CNH dos motoristas, vistoria e licenciamento dos ônibus vencidos ou vencendo nos próximos dias.",
    perfil: "semtransp",
    filtros: ["vencimento"],
    colunas: [
      { chave: "tipo", rotulo: "Documento", largura: 16 },
      { chave: "quem", rotulo: "Motorista / ônibus", largura: 30 },
      { chave: "detalhe", rotulo: "Detalhe", largura: 26 },
      { chave: "validade", rotulo: "Validade", tipo: "data", largura: 12 },
      { chave: "situacao", rotulo: "Situação", largura: 22 },
    ],
    async carregar(supabase, f) {
      return (await rpc(supabase, "vencimentos_frota", { p_dias: Number(f.dias) })).map((r) => {
        const d = r.dias === null ? null : Number(r.dias);
        return {
          tipo: r.tipo as string,
          quem: r.quem as string,
          detalhe: r.detalhe as string,
          validade: (r.validade as string | null) ?? null,
          situacao: d === null ? "Sem validade" : d < 0 ? `Vencido há ${-d} dia(s)` : d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`,
        };
      });
    },
  },
];

export const relatoriosDo = (perfil: string) => RELATORIOS.filter((r) => r.perfil === perfil);

/** Texto dos filtros usados (vai no topo do Excel). */
export function descreverFiltros(r: Relatorio, f: Filtros, instituicaoNome?: string): string {
  const partes: string[] = [];
  const br = (d: string) => d.split("-").reverse().join("/");
  if (r.filtros.includes("periodo")) partes.push(`Período: ${br(f.de)} a ${br(f.ate)}`);
  if (r.filtros.includes("vinculo")) {
    if (instituicaoNome) partes.push(`Instituição: ${instituicaoNome}`);
    if (f.curso) partes.push(`Curso: ${f.curso}`);
    if (f.turno) partes.push(`Turno: ${TURNOS[f.turno as keyof typeof TURNOS]}`);
  }
  if (r.filtros.includes("cidade") && f.cidade) partes.push(`Cidade: ${cidade(f.cidade)}`);
  if (r.filtros.includes("vencimento")) partes.push(`Vencendo em até ${f.dias} dias (e vencidos)`);
  if (r.filtros.includes("uso")) partes.push(f.uso === "todos" ? "Todos os alunos com viagens liberadas" : "Só quem não reservou no período");
  return partes.join(" · ");
}

/** Valor para mostrar na tela. */
export function formatar(c: Coluna, v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (c.tipo) {
    case "data":
      return String(v).split("-").reverse().join("/");
    case "perc":
      return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "decimal":
      return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    case "numero":
      return Number(v).toLocaleString("pt-BR");
    default:
      return String(v);
  }
}
