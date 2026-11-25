import { notFound } from "next/navigation";
import { RotasAluno, type Rota } from "@/app/painel/alunos/[id]/rotas-aluno";

/** Prévia da escolha de rotas do aluno, só no servidor local (404 em produção). */
export default function PreviaRotas() {
  if (process.env.NODE_ENV === "production") notFound();
  const s = [1, 2, 3, 4, 5, 6];
  const rotas: Rota[] = [
    { id: "c1", cidade: "campos", nome: "Ida manhã", sentido: "ida", hora: "05:30", dias: s },
    { id: "c2", cidade: "campos", nome: "Ida tarde", sentido: "ida", hora: "11:00", dias: s },
    { id: "c3", cidade: "campos", nome: "Ida noite", sentido: "ida", hora: "16:30", dias: s },
    { id: "c4", cidade: "campos", nome: "Volta 12:00", sentido: "volta", hora: "12:00", dias: s },
    { id: "c5", cidade: "campos", nome: "Volta tarde", sentido: "volta", hora: "18:15", dias: s },
    { id: "c6", cidade: "campos", nome: "Volta noite", sentido: "volta", hora: "22:00", dias: s },
    { id: "i1", cidade: "itaperuna", nome: "Ida manhã", sentido: "ida", hora: "06:00", dias: s },
    { id: "i2", cidade: "itaperuna", nome: "Ida tarde", sentido: "ida", hora: "11:00", dias: s },
    { id: "i3", cidade: "itaperuna", nome: "Ida noite", sentido: "ida", hora: "17:00", dias: s },
    { id: "i4", cidade: "itaperuna", nome: "Volta tarde", sentido: "volta", hora: "18:20", dias: s },
    { id: "i6", cidade: "itaperuna", nome: "Volta noite", sentido: "volta", hora: "22:00", dias: s },
  ];
  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-suave">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Rotas que pode reservar</h2>
        <RotasAluno rotas={rotas} selecionadas={["c3", "c6"]} />
      </div>
    </main>
  );
}
