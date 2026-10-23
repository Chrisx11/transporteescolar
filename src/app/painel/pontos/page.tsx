import type { Metadata } from "next";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo, Vazio, LinkAcao } from "@/components/ui";
import { CIDADES, type Cidade } from "@/lib/rotulos";
import { excluirPonto, salvarPonto } from "./acoes";

export const metadata: Metadata = { title: "Pontos de embarque" };

type Ponto = {
  id: string;
  nome: string;
  cidade: Cidade;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  ordem: number;
  ativo: boolean;
};

const AJUDA_CIDADE: Record<Cidade, string> = {
  italva: "Embarque das idas e desembarque das voltas.",
  campos: "Desembarque das idas e embarque das voltas.",
  itaperuna: "Desembarque das idas e embarque das voltas.",
};

export default async function PaginaPontos({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await exigirPerfil("semtransp");
  const { editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("pontos").select("*").order("cidade").order("ordem").order("nome");
  const lista = (data ?? []) as Ponto[];
  const atual = lista.find((p) => p.id === editar);

  return (
    <>
      <Titulo icone={MapPin} descricao="A ordem define a sequência da rota e a ordem da lista do motorista.">
        Pontos de embarque
      </Titulo>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {(Object.keys(CIDADES) as Cidade[]).map((cidade) => {
            const daCidade = lista.filter((p) => p.cidade === cidade);
            return (
              <div key={cidade}>
                <h2 className="mb-1 font-semibold">{CIDADES[cidade]}</h2>
                <p className="mb-2 text-xs text-slate-500">{AJUDA_CIDADE[cidade]}</p>
                {daCidade.length === 0 ? (
                  <Vazio icone={MapPin}>Nenhum ponto em {CIDADES[cidade]}.</Vazio>
                ) : (
                  <Tabela>
                    <thead>
                      <tr>
                        <th className="w-16">Ordem</th>
                        <th>Nome</th>
                        <th>Endereço</th>
                        <th>Mapa</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {daCidade.map((p) => (
                        <tr key={p.id} className={p.ativo ? "" : "opacity-50"}>
                          <td>{p.ordem}</td>
                          <td className="font-medium">
                            {p.nome} {!p.ativo && <Selo>inativo</Selo>}
                          </td>
                          <td>{p.endereco}</td>
                          <td>
                            {p.lat != null && p.lng != null ? (
                              <a
                                className="text-sm text-azul-700 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                              >
                                Ver
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-start gap-2">
                              <LinkAcao icone={Pencil} href={`/painel/pontos?editar=${p.id}`}>Editar</LinkAcao>
                              <AcaoRapida
                                acao={excluirPonto}
                                campos={{ id: p.id }}
                                rotulo="Excluir"
 icone={<Trash2 />}
                                confirmar={`Excluir o ponto "${p.nome}"? Se ele já estiver em uso, prefira desativar.`}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                )}
              </div>
            );
          })}
        </div>

        <Cartao
          icone={atual ? Pencil : Plus}
          titulo={atual ? "Editar ponto" : "Novo ponto"}
          acoes={
            atual && (
              <BotaoLink variante="link" href="/painel/pontos">
                Cancelar
              </BotaoLink>
            )
          }
        >
          <Formulario key={atual?.id ?? "novo"} acao={salvarPonto} limpar={!atual}>
            {atual && <input type="hidden" name="id" value={atual.id} />}
            <Campo rotulo="Nome">
              <Entrada name="nome" defaultValue={atual?.nome} required placeholder="Ex.: Praça da Matriz" />
            </Campo>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Campo rotulo="Cidade">
                <Selecao name="cidade" defaultValue={atual?.cidade ?? "italva"}>
                  {Object.entries(CIDADES).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Ordem">
                <Entrada name="ordem" type="number" min={0} defaultValue={atual?.ordem ?? 0} />
              </Campo>
            </div>
            <Campo rotulo="Endereço">
              <Entrada name="endereco" defaultValue={atual?.endereco ?? ""} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Latitude (opcional)">
                <Entrada name="lat" inputMode="decimal" defaultValue={atual?.lat ?? ""} placeholder="-21.42" />
              </Campo>
              <Campo rotulo="Longitude (opcional)">
                <Entrada name="lng" inputMode="decimal" defaultValue={atual?.lng ?? ""} placeholder="-41.69" />
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ativo" defaultChecked={atual?.ativo ?? true} className="size-4 accent-azul-600" />
              Ponto ativo
            </label>
            <BotaoEnviar>{atual ? "Salvar alterações" : "Cadastrar ponto"}</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
