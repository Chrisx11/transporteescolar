import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Ban, Bell, Bus, Shuffle } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Vazio, cx } from "@/components/ui";
import { dataHoraBR } from "@/lib/tempo";

export const metadata: Metadata = { title: "Avisos" };

const ICONE: Record<string, { icone: typeof Bell; cor: string }> = {
  onibus_atribuido: { icone: Bus, cor: "bg-azul-50 text-azul-600" },
  onibus_alterado: { icone: Shuffle, cor: "bg-amber-50 text-amber-600" },
  viagem_cancelada: { icone: Ban, cor: "bg-red-50 text-red-600" },
};

/** Avisos do aluno. Ao abrir, todos ficam marcados como lidos. */
export default async function PaginaAvisos() {
  const sessao = await exigirPerfil("aluno");
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("notificacoes")
    .select("id, evento, titulo, conteudo, criado_em, lida_em")
    .eq("usuario_id", sessao.id)
    .order("criado_em", { ascending: false })
    .limit(50);
  await supabase.rpc("marcar_avisos_lidos");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <Link href="/app" className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Central de</p>
          <p className="font-semibold text-slate-900">Avisos</p>
        </div>
      </div>

      {(data ?? []).length === 0 ? (
        <Vazio icone={Bell}>Você ainda não recebeu avisos. Quando o prazo de uma viagem fechar, o número do seu ônibus aparece aqui.</Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {(data ?? []).map((n) => {
            const { icone: Icone, cor } = ICONE[n.evento] ?? { icone: Bell, cor: "bg-slate-100 text-slate-600" };
            return (
              <li key={n.id} className="flex gap-3 rounded-2xl bg-white p-4 shadow-suave">
                <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", cor)}>
                  <Icone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{n.titulo}</p>
                    {!n.lida_em && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destaque-500" aria-label="novo" />}
                  </div>
                  {n.conteudo && <p className="mt-0.5 text-sm text-slate-600">{n.conteudo}</p>}
                  <p className="mt-1 text-xs text-slate-400">{dataHoraBR(n.criado_em)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
