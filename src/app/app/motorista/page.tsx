import { ArrowDownLeft, ArrowUpRight, Bus, CalendarCheck, Clock3, MoveRight, Users } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Selo, Vazio, cx } from "@/components/ui";
import { DIAS_SEMANA, dataBR, diaSemanaIso, hojeSP } from "@/lib/tempo";
import { CIDADES_CURTO, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { STATUS_VIAGEM, type StatusViagem } from "@/lib/viagens";

type Linha = {
  id: string;
  onibus: { prefixo: string; capacidade: number } | null;
  viagem: { id: string; nome: string; cidade: Cidade; sentido: Sentido; saida_em: string; prazo_em: string | null; status: StatusViagem; data: string } | null;
};

const ESTILO: Record<Sentido, { icone: typeof Bus; cor: string }> = {
  ida: { icone: ArrowUpRight, cor: "from-azul-500 to-azul-700" },
  volta: { icone: ArrowDownLeft, cor: "from-emerald-400 to-teal-600" },
  deslocamento_vazio: { icone: MoveRight, cor: "from-slate-400 to-slate-600" },
};

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Viagens do dia do motorista (escala do dia). Listas de embarque chegam na Fase 3. */
export default async function InicioMotorista() {
  const sessao = await exigirPerfil("motorista");
  const supabase = await criarClienteServidor();
  const hoje = hojeSP();
  const dia = diaSemanaIso(hoje);

  const { data } = await supabase
    .from("viagem_dia_onibus")
    .select("id, onibus(prefixo, capacidade), viagem:viagens_dia!inner(id, nome, cidade, sentido, saida_em, prazo_em, status, data)")
    .eq("motorista_id", sessao.id)
    .eq("viagem.data", hoje);

  const linhas = ((data ?? []) as unknown as Linha[])
    .filter((l) => l.viagem)
    .sort((a, b) => a.viagem!.saida_em.localeCompare(b.viagem!.saida_em));

  const ids = linhas.map((l) => l.id);
  const { data: reservas } = ids.length
    ? await supabase.from("reservas").select("viagem_dia_onibus_id").in("viagem_dia_onibus_id", ids).eq("status", "ativa")
    : { data: [] };
  const alunos = (id: string) => (reservas ?? []).filter((r) => r.viagem_dia_onibus_id === id).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <CalendarCheck className="size-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Minhas viagens</p>
          <p className="font-semibold text-slate-900">
            {DIAS_SEMANA.find((d) => d.valor === dia)?.nome}, {dataBR(hoje).slice(0, 5)}
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <Vazio icone={Bus}>Nenhuma viagem na sua escala para hoje.</Vazio>
      ) : (
        <ol className="relative flex flex-col gap-3 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-0.5 before:bg-slate-200">
          {linhas.map((l) => {
            const v = l.viagem!;
            const { icone: Icone, cor } = ESTILO[v.sentido];
            const status = STATUS_VIAGEM[v.status];
            const n = alunos(l.id);
            return (
              <li key={l.id} className={cx("relative flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-suave", v.status === "cancelada" && "opacity-60")}>
                <div className="flex items-center gap-4">
                  <span className={cx("relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", cor)}>
                    <Icone className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-2xl font-bold tabular-nums tracking-tight">
                      <Clock3 className="size-4 text-slate-300" /> {HORA.format(new Date(v.saida_em))}
                    </p>
                    <p className="truncate text-sm font-medium text-slate-700">
                      {SENTIDOS[v.sentido]} · {CIDADES_CURTO[v.cidade]}
                    </p>
                    <p className="truncate text-xs text-slate-500">{v.nome}</p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">
                    <Bus className="size-4" /> {l.onibus?.prefixo}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                  <Selo cor={status.cor}>{status.rotulo}</Selo>
                  {v.sentido !== "deslocamento_vazio" && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Users className="size-4 text-slate-400" />
                      {v.status === "agendada" && v.prazo_em
                        ? `Lista fecha às ${HORA.format(new Date(v.prazo_em))}`
                        : `${n} aluno${n === 1 ? "" : "s"} no seu ônibus`}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
