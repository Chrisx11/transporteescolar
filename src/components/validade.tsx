import { Selo } from "@/components/ui";
import { COR_VALIDADE, estadoValidade } from "@/lib/validades";
import { dataBR } from "@/lib/tempo";

/** Data de validade com cor: vermelho = vencida, amarelo = vencendo. */
export function Validade({ data, diasAviso = 30 }: { data: string | null; diasAviso?: number }) {
  const estado = estadoValidade(data, diasAviso);
  if (estado === "sem_data") return <Selo>sem data</Selo>;
  return (
    <Selo cor={COR_VALIDADE[estado]}>
      {estado === "vencido" ? "venceu " : ""}
      {dataBR(data)}
    </Selo>
  );
}
