import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bus,
  CalendarDays,
  CalendarRange,
  Clock,
  GraduationCap,
  MapPin,
  School,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Estatistica } from "@/components/ui";
import { carregarDia } from "./dia/dados";
import { DIAS_SEMANA, dataBR, diaSemanaIso, hojeSP } from "@/lib/tempo";

async function contar(tabela: string, filtro?: [string, string]) {
  const supabase = await criarClienteServidor();
  let q = supabase.from(tabela).select("*", { count: "exact", head: true });
  if (filtro) q = q.eq(filtro[0], filtro[1]);
  const { count } = await q;
  return count ?? 0;
}

function saudacao() {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

type Atalho = { href: string; rotulo: string; descricao: string; icone: LucideIcon };

export default async function InicioPainel() {
  const sessao = await exigirPerfil("semeduc", "semtransp", "admin");
  const veTransp = sessao.perfil !== "semeduc";
  const veEduc = sessao.perfil !== "semtransp";
  const hoje = hojeSP();

  const [onibus, motoristas, pontos, alunosAtivos, alunosPendentes, instituicoes] = await Promise.all([
    veTransp ? contar("onibus", ["situacao", "ativo"]) : 0,
    veTransp ? contar("motoristas") : 0,
    veTransp ? contar("pontos", ["ativo", "true"]) : 0,
    veEduc ? contar("alunos", ["situacao", "ativo"]) : 0,
    veEduc ? contar("alunos", ["situacao", "pendente"]) : 0,
    veEduc ? contar("instituicoes", ["ativa", "true"]) : 0,
  ]);
  const doDia = veTransp ? await carregarDia(hoje) : [];
  const resumo = {
    viagens: doDia.filter((v) => v.status !== "cancelada").length,
    reservas: doDia.reduce((s, v) => s + (v.status === "cancelada" ? 0 : v.reservas), 0),
    alertas: doDia.reduce((s, v) => s + v.alertas.length, 0),
  };

  const atalhos: Atalho[] = [
    ...(veEduc
      ? [
          { href: "/painel/alunos/novo", rotulo: "Cadastrar aluno", descricao: "Novo cadastro com senha provisória", icone: UserPlus },
          { href: "/painel/calendario", rotulo: "Feriados e recessos", descricao: "Dias sem transporte", icone: CalendarDays },
        ]
      : []),
    ...(veTransp
      ? [
          { href: "/painel/escala", rotulo: "Escala semanal", descricao: "Ônibus e motoristas por viagem", icone: CalendarRange },
          { href: "/painel/onibus", rotulo: "Frota e QR codes", descricao: "Imprimir adesivos dos ônibus", icone: Bus },
        ]
      : []),
  ];

  return (
    <>
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-azul-600 via-azul-700 to-azul-900 p-6 text-white shadow-elevada sm:p-8">
        <div className="fundo-pontos absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -right-10 -top-16 size-64 rounded-full bg-destaque-400/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm text-azul-100">
              <Clock className="size-4" />
              {DIAS_SEMANA.find((d) => d.valor === diaSemanaIso(hoje))?.nome}, {dataBR(hoje)}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {saudacao()}, {sessao.nome.split(" ")[0]}!
            </h1>
            <p className="mt-1 text-azul-100/90">
              {veTransp
                ? `Hoje: ${resumo.viagens} viagens, ${resumo.reservas} reservas${resumo.alertas ? `, ${resumo.alertas} alerta(s)` : ""}.`
                : "Aqui está o resumo dos cadastros do transporte."}
            </p>
          </div>
          {veTransp && (
            <Link
              href="/painel/dia"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-azul-800 shadow-lg transition hover:bg-azul-50"
            >
              <Activity className="size-4" /> Abrir painel do dia
              {resumo.alertas > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{resumo.alertas}</span>
              )}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {veTransp && (
          <>
            <Link href="/painel/onibus">
              <Estatistica rotulo="Ônibus ativos" valor={onibus} icone={Bus} cor="azul" />
            </Link>
            <Link href="/painel/motoristas">
              <Estatistica rotulo="Motoristas" valor={motoristas} icone={UserCog} cor="amarelo" />
            </Link>
            <Link href="/painel/pontos">
              <Estatistica rotulo="Pontos de embarque" valor={pontos} icone={MapPin} cor="ciano" />
            </Link>
          </>
        )}
        {veEduc && (
          <>
            <Link href="/painel/alunos?situacao=ativo">
              <Estatistica rotulo="Alunos ativos" valor={alunosAtivos} icone={GraduationCap} cor="verde" />
            </Link>
            <Link href="/painel/alunos?situacao=pendente">
              <Estatistica
                rotulo="Cadastros pendentes"
                valor={alunosPendentes}
                icone={UserPlus}
                cor="rosa"
                detalhe={alunosPendentes > 0 ? "Aguardando conferência" : "Nenhum aguardando"}
              />
            </Link>
            <Link href="/painel/instituicoes">
              <Estatistica rotulo="Instituições" valor={instituicoes} icone={School} cor="roxo" />
            </Link>
          </>
        )}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-slate-400">Atalhos</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {atalhos.map(({ href, rotulo, descricao, icone: Icone }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-suave transition-all hover:-translate-y-0.5 hover:border-azul-200 hover:shadow-elevada"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-azul-50 text-azul-600 transition-colors group-hover:bg-azul-600 group-hover:text-white">
              <Icone className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{rotulo}</span>
              <span className="block truncate text-xs text-slate-500">{descricao}</span>
            </span>
            <ArrowUpRight className="size-4 text-slate-300 transition-colors group-hover:text-azul-600" />
          </Link>
        ))}
      </div>
    </>
  );
}
