import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, CalendarX2 } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio, cx } from "@/components/ui";
import { DIAS_SEMANA, dataBR, diaSemanaIso, hojeSP, somarDias } from "@/lib/tempo";
import type { MinhaViagem } from "@/lib/viagens";
import { CartaoViagem } from "./cartao-viagem";

/**
 * Tela inicial do aluno: viagens de Hoje (e de Amanhã, quando a reserva já
 * abriu). Mostra só o que está na grade (RN01), com prazo e botão de reserva.
 */
export default async function HojeAluno({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sessao = await exigirPerfil("aluno", "motorista");
  if (sessao.perfil === "motorista") redirect("/app/motorista");

  const supabase = await criarClienteServidor();
  const hoje = hojeSP();
  const amanha = somarDias(hoje, 1);

  const [{ data: aluno }, { data: deHoje }, { data: deAmanha }] = await Promise.all([
    supabase.from("alunos").select("situacao, matricula_validade").eq("usuario_id", sessao.id).maybeSingle(),
    supabase.rpc("minhas_viagens", { p_data: hoje }),
    supabase.rpc("minhas_viagens", { p_data: amanha }),
  ]);

  const listaAmanha = (deAmanha ?? []) as MinhaViagem[];
  // A aba "Amanhã" aparece quando alguma viagem de amanhã já abriu (ou já tem reserva).
  const amanhaAberto = listaAmanha.some((v) => v.reserva_id || (v.motivo !== "ainda_nao_abriu" && v.motivo !== "nao_gerada"));
  const aba = (await searchParams).dia === "amanha" && amanhaAberto ? "amanha" : "hoje";
  const data = aba === "hoje" ? hoje : amanha;
  const lista = aba === "hoje" ? ((deHoje ?? []) as MinhaViagem[]) : listaAmanha;
  const vencida = aluno?.matricula_validade && aluno.matricula_validade < hoje;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white p-2 shadow-elevada">
        <div className="grid grid-cols-2 gap-1">
          {[
            { chave: "hoje", rotulo: "Hoje", data: hoje, href: "/app", ativo: true },
            { chave: "amanha", rotulo: "Amanhã", data: amanha, href: "/app?dia=amanha", ativo: amanhaAberto },
          ].map((t) =>
            t.ativo ? (
              <Link
                key={t.chave}
                href={t.href}
                className={cx(
                  "flex flex-col items-center rounded-xl py-2 transition-colors",
                  aba === t.chave ? "bg-azul-600 text-white shadow-md shadow-azul-600/30" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="text-sm font-semibold">{t.rotulo}</span>
                <span className={cx("text-xs", aba === t.chave ? "text-azul-100" : "text-slate-400")}>
                  {DIAS_SEMANA.find((d) => d.valor === diaSemanaIso(t.data))?.curto}, {dataBR(t.data).slice(0, 5)}
                </span>
              </Link>
            ) : (
              <span key={t.chave} className="flex flex-col items-center rounded-xl py-2 text-slate-300" title="A reserva de amanhã ainda não abriu">
                <span className="text-sm font-semibold">{t.rotulo}</span>
                <span className="text-xs">ainda não abriu</span>
              </span>
            ),
          )}
        </div>
      </div>

      {aluno?.situacao === "pendente" && <Aviso tipo="alerta">Seu cadastro está em análise pela Secretaria de Educação.</Aviso>}
      {aluno?.situacao === "inativo" && <Aviso tipo="erro">Seu cadastro está inativo. Procure a Secretaria de Educação.</Aviso>}
      {vencida && (
        <Aviso tipo="erro">
          Sua matrícula venceu em {dataBR(aluno.matricula_validade)}. Envie um comprovante novo para voltar a reservar.
        </Aviso>
      )}

      {lista.length === 0 ? (
        <Vazio icone={CalendarCheck}>
          Você não tem viagens na sua grade para {aba === "hoje" ? "hoje" : "amanhã"}.
        </Vazio>
      ) : lista.every((v) => v.motivo === "sem_operacao") ? (
        <Vazio icone={CalendarX2}>Não há transporte em {dataBR(data)} (feriado ou recesso).</Vazio>
      ) : (
        lista.map((v) => <CartaoViagem key={`${data}-${v.sentido}`} v={v} />)
      )}
    </div>
  );
}
