import { notFound } from "next/navigation";
import { Volta2030 } from "@/app/app/motorista/volta-2030";
import { Volta2030Aluno } from "@/app/app/volta-2030-aluno";

/** Prévia dos cartões da volta 20:30 (motorista e aluno), só no servidor local (404 em produção). */
export default function PreviaVolta2030() {
  if (process.env.NODE_ENV === "production") notFound();
  const saida = new Date(new Date().toDateString() + " 20:30").toISOString();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 bg-[#f4f6fb] p-4">
      <p className="text-xs font-semibold text-slate-500">MOTORISTA · pode liberar</p>
      <Volta2030
        info={{
          existe: true, pode_ver: true, saida_em: saida, liberacao: null, pode_liberar: true, reservas_22: 50, capacidade_22: 84,
          onibus: [
            { id: "a", prefixo: "07", placa: "KZT1A23", capacidade: 44, fica: 40, minimo: 10, possivel: true },
            { id: "b", prefixo: "09", placa: "LMN2B34", capacidade: 40, fica: 44, minimo: 6, possivel: true },
          ],
        }}
      />
      <p className="text-xs font-semibold text-slate-500">MOTORISTA · liberada</p>
      <Volta2030 info={{ existe: true, pode_ver: true, saida_em: saida, liberacao: { status: "aberta", vagas: 10, reservados: 6, prefixo: "07", liberada_por: "JOÃO", minha: false } }} />
      <p className="text-xs font-semibold text-slate-500">ALUNO · liberada</p>
      <Volta2030Aluno v={{ status: "aberta", saida_em: saida, vagas: 10, reservados: 6, minha: null, na_22: true, prefixo: "07" }} />
      <p className="text-xs font-semibold text-slate-500">ALUNO · na lista</p>
      <Volta2030Aluno v={{ status: "aberta", saida_em: saida, vagas: 10, reservados: 7, minha: "aguardando", na_22: true, prefixo: "07" }} />
    </main>
  );
}
