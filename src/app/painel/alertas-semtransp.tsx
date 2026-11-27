import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeAlert, Users } from "lucide-react";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSP, somarDias } from "@/lib/tempo";
import { CIDADES_CURTO } from "@/lib/rotulos";
import { carregarDia } from "./dia/dados";

type Vencimento = { tipo: string; quem: string; detalhe: string; validade: string | null; dias: number | null };

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Alertas da SEMTRANSP no painel (Fase 6): documentos da frota vencidos ou
 * vencendo e, opcionalmente, viagens de hoje e amanhã com mais reservas que lugares.
 */
export async function AlertasSemtransp({ excesso = false }: { excesso?: boolean }) {
  const supabase = await criarClienteServidor();
  const hoje = hojeSP();
  const [{ data }, dias] = await Promise.all([
    supabase.rpc("vencimentos_frota"),
    excesso ? Promise.all([carregarDia(hoje), carregarDia(somarDias(hoje, 1))]) : Promise.resolve([[], []]),
  ]);
  const vencimentos = (data ?? []) as Vencimento[];
  const lotadas = dias
    .flat()
    .filter((v) => v.status !== "cancelada" && v.reservas > v.capacidade && new Date(v.saida_em) > new Date())
    .slice(0, 6);
  if (vencimentos.length === 0 && lotadas.length === 0) return null;

  const situacao = (d: number | null) => (d === null ? "sem validade" : d < 0 ? `vencido há ${-d} dia(s)` : d === 0 ? "vence hoje" : `vence em ${d} dia(s)`);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      {lotadas.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold text-red-800">
            <Users className="size-5" /> Excesso de reservas
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-red-900">
            {lotadas.map((v) => (
              <li key={v.id}>
                <Link href={`/painel/dia/${v.id}`} className="flex items-center justify-between gap-2 hover:underline">
                  <span>
                    {v.nome} · {CIDADES_CURTO[v.cidade]} · {new Date(v.saida_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })} às{" "}
                    {HORA.format(new Date(v.saida_em))}
                  </span>
                  <strong className="shrink-0">
                    {v.reservas} reservas / {v.capacidade} lugares
                  </strong>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-700">Coloque um ônibus extra na viagem e use “Realocar alunos”.</p>
        </section>
      )}
      {vencimentos.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
            <BadgeAlert className="size-5" /> Documentos da frota
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-amber-950">
            {vencimentos.slice(0, 6).map((v, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {v.dias !== null && v.dias < 0 && <AlertTriangle className="size-4 text-red-600" />}
                  {v.tipo} · {v.quem}
                </span>
                <span className={v.dias !== null && v.dias < 0 ? "shrink-0 font-semibold text-red-700" : "shrink-0 font-medium"}>{situacao(v.dias)}</span>
              </li>
            ))}
          </ul>
          <Link href="/painel/relatorios?r=vencimentos" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline">
            Ver todos ({vencimentos.length}) <ArrowRight className="size-3.5" />
          </Link>
        </section>
      )}
    </div>
  );
}
