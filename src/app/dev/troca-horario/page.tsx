import { notFound } from "next/navigation";
import { TelaTrocaHorario } from "@/app/app/troca-horario/tela-troca-horario";
import { FormJustificativa } from "@/app/app/historico/justificar/[id]/form-justificativa";

/** Prévia das telas de troca de horário e justificativa, só no servidor local (404 em produção). */
export default async function PreviaTroca({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const tela = (await searchParams).tela;
  const todos = [1, 2, 3, 4, 5, 6];
  return (
    <main className="mx-auto max-w-md bg-[#f4f6fb] p-4">
      {tela === "justificar" ? (
        <FormJustificativa frequencia={1} viagem="Ida manhã · segunda-feira, 26/10, 05:30" podeJustificar />
      ) : (
        <TelaTrocaHorario
          hoje="2026-11-27"
          maximo="2027-01-26"
          modelos={[
            { id: "1", nome: "Ida manhã", cidade: "campos", sentido: "ida", hora_saida: "05:30:00", dias_semana: todos },
            { id: "2", nome: "Ida tarde", cidade: "campos", sentido: "ida", hora_saida: "11:00:00", dias_semana: todos },
            { id: "3", nome: "Volta tarde", cidade: "campos", sentido: "volta", hora_saida: "18:15:00", dias_semana: todos },
            { id: "4", nome: "Ida noite", cidade: "itaperuna", sentido: "ida", hora_saida: "17:00:00", dias_semana: todos },
          ]}
          pedidos={[
            { id: "a", data: "2026-12-02", motivo: "Prova no turno da tarde", status: "pendente", resposta: null, ida: { nome: "Ida tarde", cidade: "campos", hora_saida: "11:00:00" }, volta: null },
            { id: "b", data: "2026-11-20", motivo: "Aula prática", status: "recusada", resposta: "Sem vaga nesse horário", ida: null, volta: { nome: "Volta tarde", cidade: "campos", hora_saida: "18:15:00" } },
          ]}
        />
      )}
    </main>
  );
}
