import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Cabeçalho das telas de acesso (troca de senha, recuperação, termo). */
export function CabecalhoAuth({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-azul-50 text-azul-600 ring-8 ring-azul-50/50">
        <Icone className="size-6" />
      </span>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
        {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
      </div>
    </div>
  );
}
