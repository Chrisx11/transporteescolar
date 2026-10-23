import { ArrowDownLeft, ArrowUpRight, Bus, CalendarCheck, MoveRight } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Vazio, cx } from "@/components/ui";
import { DIAS_SEMANA, dataBR, diaSemanaIso, hhmm, hojeSP } from "@/lib/tempo";
import { CIDADES, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";

type Linha = {
  id: string;
  onibus: { prefixo: string } | null;
  viagem: { nome: string; cidade: Cidade; sentido: Sentido; hora_saida: string } | null;
};

const ESTILO: Record<Sentido, { icone: typeof Bus; cor: string }> = {
  ida: { icone: ArrowUpRight, cor: "from-azul-500 to-azul-700" },
  volta: { icone: ArrowDownLeft, cor: "from-emerald-400 to-teal-600" },
  deslocamento_vazio: { icone: MoveRight, cor: "from-slate-400 to-slate-600" },
};

/** Tela do motorista. Na Fase 1 mostra a escala modelo de hoje; listas de embarque chegam na Fase 3. */
export default async function InicioMotorista() {
  const sessao = await exigirPerfil("motorista");
  const supabase = await criarClienteServidor();
  const hoje = hojeSP();
  const dia = diaSemanaIso(hoje);

  const { data } = await supabase
    .from("escala_modelo")
    .select("id, onibus(prefixo), viagem:viagens_modelo(nome, cidade, sentido, hora_saida)")
    .eq("motorista_id", sessao.id)
    .eq("dia_semana", dia);

  const linhas = ((data ?? []) as unknown as Linha[]).sort((a, b) =>
    (a.viagem?.hora_saida ?? "").localeCompare(b.viagem?.hora_saida ?? ""),
  );

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
            const { icone: Icone, cor } = ESTILO[l.viagem!.sentido];
            return (
              <li key={l.id} className="relative flex items-center gap-4 rounded-2xl bg-white p-4 shadow-suave">
                <span className={cx("relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", cor)}>
                  <Icone className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold tabular-nums tracking-tight">{hhmm(l.viagem?.hora_saida)}</p>
                  <p className="truncate text-sm font-medium text-slate-700">
                    {SENTIDOS[l.viagem!.sentido]} · {CIDADES[l.viagem!.cidade]}
                  </p>
                  <p className="truncate text-xs text-slate-500">{l.viagem?.nome}</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                  <Bus className="size-4" /> {l.onibus?.prefixo}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
