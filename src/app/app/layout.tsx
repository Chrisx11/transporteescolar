import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Avatar, Marca } from "@/components/ui";
import { PERFIS } from "@/lib/rotulos";

/** Layout de celular (aluno e motorista). */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await exigirPerfil("aluno", "motorista");

  if (sessao.perfil === "aluno") {
    // Termo de uso (LGPD): o aluno aceita a versão atual antes de usar o app.
    const supabase = await criarClienteServidor();
    const { data: p } = await supabase.from("parametros").select("valor").eq("chave", "termo_versao").single();
    const { count } = await supabase
      .from("aceites_termo")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", sessao.id)
      .eq("versao", String(p?.valor ?? "1.0"));
    if (!count) redirect("/termo");
  }

  const supabase = await criarClienteServidor();
  const { count } = await supabase
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", sessao.id)
    .is("lida_em", null);
  const naoLidos = count ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#f4f6fb] sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:shadow-elevada">
      <header className="relative overflow-hidden bg-gradient-to-br from-azul-600 via-azul-700 to-azul-900 px-5 pb-16 pt-6 text-white">
        <div className="fundo-pontos absolute inset-0 opacity-50" aria-hidden />
        <div className="absolute -right-12 -top-12 size-48 rounded-full bg-destaque-400/25 blur-3xl" aria-hidden />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Marca className="size-9" />
            <span className="text-sm font-semibold text-azul-100">Transporte Italva</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={sessao.perfil === "aluno" ? "/app/avisos" : "/app/motorista"}
              className="relative flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20"
              aria-label={naoLidos ? `${naoLidos} avisos novos` : "Avisos"}
            >
              <Bell className="size-4" />
              {naoLidos > 0 && (
                <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-destaque-400 px-1 text-[11px] font-bold text-azul-950 ring-2 ring-azul-700">
                  {naoLidos > 9 ? "9+" : naoLidos}
                </span>
              )}
            </Link>
            <form action="/auth/sair" method="post">
              <button
                className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 transition hover:bg-white/20"
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        <div className="relative mt-6 flex items-center gap-3">
          <Avatar nome={sessao.nome} className="size-12 text-sm ring-2 ring-white/30" />
          <div>
            <p className="text-sm text-azul-100">Olá,</p>
            <p className="text-xl font-bold leading-tight">{sessao.nome.split(" ")[0]}</p>
          </div>
          <span className="ml-auto rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
            {PERFIS[sessao.perfil]}
          </span>
        </div>
      </header>
      <main className="relative -mt-10 flex-1 animate-surgir px-4 pb-8">{children}</main>
    </div>
  );
}
