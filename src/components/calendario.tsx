import { CalendarX2, Trash2 } from "lucide-react";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { Campo, Cartao, Entrada, Selecao, Selo, Tabela, Vazio } from "@/components/ui";
import { TIPOS_CALENDARIO } from "@/lib/rotulos";
import { DIAS_SEMANA, dataBR, diaSemanaIso } from "@/lib/tempo";
import { excluirDiaCalendario, salvarDiaCalendario } from "@/app/painel/instituicoes/acoes";

export type DiaCalendario = {
  id: string;
  data: string;
  tipo: keyof typeof TIPOS_CALENDARIO;
  descricao: string;
};

/** Lista + formulário de dias sem operação (geral ou de uma instituição). */
export function EditorCalendario({
  dias,
  instituicaoId,
  titulo,
}: {
  dias: DiaCalendario[];
  instituicaoId?: string;
  titulo: string;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {dias.length === 0 ? (
          <Vazio icone={CalendarX2}>Nenhum dia cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap">
                    {dataBR(d.data)}{" "}
                    <span className="text-xs text-slate-500">
                      {DIAS_SEMANA.find((x) => x.valor === diaSemanaIso(d.data))?.curto}
                    </span>
                  </td>
                  <td>
                    <Selo cor={d.tipo === "feriado" ? "vermelho" : d.tipo === "recesso" ? "amarelo" : "cinza"}>
                      {TIPOS_CALENDARIO[d.tipo]}
                    </Selo>
                  </td>
                  <td>{d.descricao}</td>
                  <td>
                    <AcaoRapida acao={excluirDiaCalendario} campos={{ id: d.id }} rotulo="Remover"
 icone={<Trash2 />} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </div>
      <Cartao titulo={titulo}>
        <Formulario acao={salvarDiaCalendario} limpar>
          {instituicaoId && <input type="hidden" name="instituicao_id" value={instituicaoId} />}
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data">
              <Entrada name="data" type="date" required />
            </Campo>
            <Campo rotulo="Até (opcional)" ajuda="Para vários dias seguidos.">
              <Entrada name="ate" type="date" />
            </Campo>
          </div>
          <Campo rotulo="Tipo">
            <Selecao name="tipo" defaultValue={instituicaoId ? "sem_aula" : "feriado"}>
              {Object.entries(TIPOS_CALENDARIO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Descrição">
            <Entrada name="descricao" required placeholder="Ex.: Proclamação da República" />
          </Campo>
          <BotaoEnviar>Adicionar</BotaoEnviar>
        </Formulario>
      </Cartao>
    </div>
  );
}
