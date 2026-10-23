"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { cx } from "@/components/ui";

/**
 * Atualiza a página sozinha quando reservas, viagens ou escala do dia mudam
 * (Supabase Realtime). As mudanças em sequência são agrupadas.
 */
export function TempoReal() {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let ativo = true;
    const recarregar = () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => router.refresh(), 800);
    };

    (async () => {
      // O tempo real precisa da sessão do usuário: sem ela, as permissões do
      // banco (RLS) escondem os eventos e o painel nunca atualiza.
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      if (!ativo) return;
      canal = supabase
        .channel("painel-do-dia")
        .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, recarregar)
        .on("postgres_changes", { event: "*", schema: "public", table: "viagens_dia" }, recarregar)
        .on("postgres_changes", { event: "*", schema: "public", table: "viagem_dia_onibus" }, recarregar)
        .subscribe((status) => setConectado(status === "SUBSCRIBED"));
    })();

    return () => {
      ativo = false;
      if (espera.current) clearTimeout(espera.current);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [router]);

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
        conectado ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-slate-100 text-slate-500 ring-slate-500/15",
      )}
      title={conectado ? "O painel atualiza sozinho quando algo muda" : "Conectando à atualização automática…"}
    >
      <span className="relative flex size-2">
        {conectado && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={cx("relative inline-flex size-2 rounded-full", conectado ? "bg-emerald-500" : "bg-slate-400")} />
      </span>
      {conectado ? "Ao vivo" : "Conectando…"}
    </span>
  );
}
