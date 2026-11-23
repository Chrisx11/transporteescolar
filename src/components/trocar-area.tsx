import Link from "next/link";
import { cx } from "@/components/ui";

/** Faixa que só o Admin vê: troca entre painel, app do aluno e app do motorista. */
export function TrocarArea({ atual }: { atual: "painel" | "aluno" | "motorista" }) {
  const areas = [
    { chave: "painel", rotulo: "Painel" },
    { chave: "aluno", rotulo: "Aluno" },
    { chave: "motorista", rotulo: "Motorista" },
  ] as const;
  return (
    <div className="nao-imprimir flex items-center justify-center gap-1 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
      <span className="mr-1">Admin · ver como:</span>
      {areas.map((a) => (
        <Link
          key={a.chave}
          href={`/auth/modo?para=${a.chave}`}
          prefetch={false}
          className={cx("rounded-md px-2 py-0.5 font-medium", a.chave === atual ? "bg-white text-slate-900" : "hover:bg-white/10")}
        >
          {a.rotulo}
        </Link>
      ))}
    </div>
  );
}
