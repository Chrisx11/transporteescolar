import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, Clock3, MapPin, Sparkles } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Aviso, Vazio, cx } from "@/components/ui";
import { DIAS_SEMANA, dataBR, diaSemanaIso, hhmm, hojeSP } from "@/lib/tempo";
import { CIDADES, type Cidade } from "@/lib/rotulos";

type Viagem = { nome: string; cidade: Cidade; hora_saida: string } | null;

/** Tela inicial do aluno. Na Fase 1 mostra a grade de hoje; reservas chegam na Fase 2. */
export default async function HojeAluno() {
  const sessao = await exigirPerfil("aluno", "motorista");
  if (sessao.perfil === "motorista") redirect("/app/motorista");

  const supabase = await criarClienteServidor();
  const hoje = hojeSP();
  const dia = diaSemanaIso(hoje);
  const [{ data: aluno }, { data: grade }] = await Promise.all([
    supabase.from("alunos").select("situacao, matricula_validade").eq("usuario_id", sessao.id).maybeSingle(),
    supabase
      .from("grade_semanal")
      .select(
        "ida:viagens_modelo!grade_semanal_viagem_ida_modelo_id_fkey(nome, cidade, hora_saida), volta:viagens_modelo!grade_semanal_viagem_volta_modelo_id_fkey(nome, cidade, hora_saida)",
      )
      .eq("aluno_id", sessao.id)
      .eq("dia_semana", dia)
      .maybeSingle(),
  ]);

  const ida = (grade?.ida ?? null) as unknown as Viagem;
  const volta = (grade?.volta ?? null) as unknown as Viagem;
  const vencida = aluno?.matricula_validade && aluno.matricula_validade < hoje;
  const trechos = [
    { rotulo: "Ida", v: ida, icone: ArrowUpRight, cor: "from-azul-500 to-azul-700", texto: "Italva → " },
    { rotulo: "Volta", v: volta, icone: ArrowDownLeft, cor: "from-emerald-400 to-teal-600", texto: "→ Italva" },
  ].filter((t) => t.v);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-elevada">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-azul-50 text-azul-600">
            <CalendarCheck className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Hoje</p>
            <p className="font-semibold text-slate-900">
              {DIAS_SEMANA.find((d) => d.valor === dia)?.nome}, {dataBR(hoje).slice(0, 5)}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {trechos.length} {trechos.length === 1 ? "viagem" : "viagens"}
        </span>
      </div>

      {aluno?.situacao === "pendente" && <Aviso tipo="alerta">Seu cadastro está em análise pela Secretaria de Educação.</Aviso>}
      {aluno?.situacao === "inativo" && <Aviso tipo="erro">Seu cadastro está inativo. Procure a Secretaria de Educação.</Aviso>}
      {vencida && (
        <Aviso tipo="erro">
          Sua matrícula venceu em {dataBR(aluno.matricula_validade)}. Envie um comprovante novo para voltar a reservar.
        </Aviso>
      )}

      {trechos.length === 0 ? (
        <Vazio icone={CalendarCheck}>Você não tem viagens na sua grade para hoje.</Vazio>
      ) : (
        trechos.map(({ rotulo, v, icone: Icone, cor, texto }) => (
          <article key={rotulo} className="overflow-hidden rounded-3xl bg-white shadow-suave">
            <div className="flex items-center gap-4 p-5">
              <span className={cx("flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", cor)}>
                <Icone className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{rotulo}</p>
                <p className="truncate font-semibold text-slate-900">{v!.nome}</p>
                <p className="flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="size-3.5" />
                  {rotulo === "Ida" ? `${texto}${CIDADES[v!.cidade]}` : `${CIDADES[v!.cidade]} ${texto}`}
                </p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-xs text-slate-400">
                  <Clock3 className="size-3.5" /> saída
                </p>
                <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">{hhmm(v!.hora_saida)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-dashed border-slate-200 bg-slate-50/70 px-5 py-3 text-xs text-slate-500">
              <Sparkles className="size-3.5 text-destaque-500" />
              A reserva pelo app estará disponível em breve.
            </div>
          </article>
        ))
      )}
    </div>
  );
}
