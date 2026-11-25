import { notFound } from "next/navigation";
import { TipoPonto } from "@/app/painel/pontos/tipo-ponto";

/** Prévia do campo Ida/Volta do cadastro de pontos, só no servidor local (404 em produção). */
export default function PreviaPonto() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-sm p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-suave">
        <TipoPonto />
      </div>
    </main>
  );
}
