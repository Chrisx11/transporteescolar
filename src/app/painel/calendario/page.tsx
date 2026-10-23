import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Titulo } from "@/components/ui";
import { EditorCalendario, type DiaCalendario } from "@/components/calendario";
import { hojeSP, somarDias } from "@/lib/tempo";

export const metadata: Metadata = { title: "Feriados e recessos" };

export default async function PaginaCalendario() {
  await exigirPerfil("semeduc");
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("calendario")
    .select("id, data, tipo, descricao")
    .is("instituicao_id", null)
    .gte("data", somarDias(hojeSP(), -30))
    .order("data");

  return (
    <>
      <Titulo icone={CalendarDays} descricao="Dias sem transporte para todos os alunos. Dias sem aula de uma instituição ficam na página da instituição.">
        Feriados e recessos
      </Titulo>
      <EditorCalendario dias={(data ?? []) as DiaCalendario[]} titulo="Novo feriado ou recesso" />
    </>
  );
}
