import type { Metadata } from "next";
import { Bus, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo, Vazio, LinkAcao } from "@/components/ui";
import { Validade } from "@/components/validade";
import { SITUACOES_ONIBUS } from "@/lib/rotulos";
import { excluirOnibus, salvarOnibus } from "./acoes";

export const metadata: Metadata = { title: "Ônibus" };

type Onibus = {
  id: string;
  prefixo: string;
  placa: string;
  capacidade: number;
  situacao: keyof typeof SITUACOES_ONIBUS;
  vistoria_validade: string | null;
  licenciamento_validade: string | null;
};

export default async function PaginaOnibus({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await exigirPerfil("semtransp");
  const { editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("onibus").select("*").order("prefixo");
  const lista = (data ?? []) as Onibus[];
  const atual = lista.find((o) => o.id === editar);
  const capacidadeTotal = lista.filter((o) => o.situacao === "ativo").reduce((s, o) => s + o.capacidade, 0);

  return (
    <>
      <Titulo icone={Bus} descricao={`${lista.length} ônibus · ${capacidadeTotal} lugares nos ônibus ativos`}>Ônibus</Titulo>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        {lista.length === 0 ? (
          <Vazio icone={Bus}>Nenhum ônibus cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Prefixo</th>
                <th>Placa</th>
                <th>Lugares</th>
                <th>Situação</th>
                <th>Vistoria</th>
                <th>Licenciamento</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id}>
                  <td className="font-semibold">{o.prefixo}</td>
                  <td>{o.placa}</td>
                  <td>{o.capacidade}</td>
                  <td>
                    <Selo cor={o.situacao === "ativo" ? "verde" : "amarelo"}>{SITUACOES_ONIBUS[o.situacao]}</Selo>
                  </td>
                  <td>
                    <Validade data={o.vistoria_validade} />
                  </td>
                  <td>
                    <Validade data={o.licenciamento_validade} />
                  </td>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <LinkAcao icone={Pencil} href={`/painel/onibus?editar=${o.id}`}>Editar</LinkAcao>
                      <LinkAcao icone={QrCode} href={`/painel/onibus/${o.id}/adesivo`}>QR / adesivo</LinkAcao>
                      <AcaoRapida
                        acao={excluirOnibus}
                        campos={{ id: o.id }}
                        rotulo="Excluir"
 icone={<Trash2 />}
                        confirmar={`Excluir o ônibus ${o.prefixo}?`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}

        <Cartao
          icone={atual ? Pencil : Plus}
          titulo={atual ? `Editar ${atual.prefixo}` : "Novo ônibus"}
          acoes={
            atual && (
              <BotaoLink variante="link" href="/painel/onibus">
                Cancelar
              </BotaoLink>
            )
          }
        >
          <Formulario key={atual?.id ?? "novo"} acao={salvarOnibus} limpar={!atual}>
            {atual && <input type="hidden" name="id" value={atual.id} />}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Prefixo">
                <Entrada name="prefixo" defaultValue={atual?.prefixo} required placeholder="Ex.: 01" />
              </Campo>
              <Campo rotulo="Placa">
                <Entrada name="placa" defaultValue={atual?.placa} required placeholder="ABC1D23" />
              </Campo>
              <Campo rotulo="Lugares">
                <Entrada name="capacidade" type="number" min={1} defaultValue={atual?.capacidade} required />
              </Campo>
              <Campo rotulo="Situação">
                <Selecao name="situacao" defaultValue={atual?.situacao ?? "ativo"}>
                  {Object.entries(SITUACOES_ONIBUS).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            </div>
            <Campo rotulo="Vistoria válida até">
              <Entrada name="vistoria_validade" type="date" defaultValue={atual?.vistoria_validade ?? ""} />
            </Campo>
            <Campo rotulo="Licenciamento válido até">
              <Entrada name="licenciamento_validade" type="date" defaultValue={atual?.licenciamento_validade ?? ""} />
            </Campo>
            <BotaoEnviar>{atual ? "Salvar alterações" : "Cadastrar ônibus"}</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
