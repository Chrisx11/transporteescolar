import Link from "next/link";
import { cx } from "@/components/ui";

const AREAS = [
  { chave: "admin", rotulo: "Admin" },
  { chave: "semeduc", rotulo: "SEMEDUC" },
  { chave: "semtransp", rotulo: "SEMTRANSP" },
  { chave: "aluno", rotulo: "Aluno" },
  { chave: "motorista", rotulo: "Motorista" },
] as const;

export type Area = (typeof AREAS)[number]["chave"];

/** Faixa que só o Admin vê: troca entre as áreas do sistema com o mesmo login. */
export function TrocarArea({ atual }: { atual: Area }) {
  return (
    <div className="nao-imprimir flex flex-wrap items-center justify-center gap-1 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
      <span className="mr-1">Ver como:</span>
      {AREAS.map((a) => (
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
