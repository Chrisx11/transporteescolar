import type { Metadata } from "next";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selo, Tabela, Titulo, Vazio, LinkAcao } from "@/components/ui";
import type { Cidade } from "@/lib/rotulos";
import { excluirPonto, salvarPonto } from "./acoes";
import { TipoPonto } from "./tipo-ponto";

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
  linha: "campos" | "itaperuna" | null;
};

const GRUPOS: { chave: string; titulo: string; ajuda: string; filtro: (p: Ponto) => boolean }[] = [
  {
    chave: "ida-itaperuna",
    titulo: "Ida · Italva x Itaperuna",
    ajuda: "Em Italva, na linha de Itaperuna: embarque da ida e desembarque da volta.",
    filtro: (p) => p.cidade === "italva" && p.linha === "itaperuna",
  },
  {
    chave: "ida-campos",
    titulo: "Ida · Italva x Campos",
    ajuda: "Em Italva, na linha de Campos: embarque da ida e desembarque da volta.",
    filtro: (p) => p.cidade === "italva" && p.linha === "campos",
  },
  {
    chave: "volta-campos",
    titulo: "Volta · Campos x Italva",
    ajuda: "Em Campos: embarque da volta e desembarque da ida.",
    filtro: (p) => p.cidade === "campos",
  },
  {
    chave: "volta-itaperuna",
    titulo: "Volta · Itaperuna x Italva",
    ajuda: "Em Itaperuna: embarque da volta e desembarque da ida.",
    filtro: (p) => p.cidade === "itaperuna",
  },
  {
    chave: "ida-sem-linha",
    titulo: "Ida · Italva (sem linha definida)",
    ajuda: "Cadastrados antes da separação por linha: valem para as duas. Edite e escolha a linha.",
    filtro: (p) => p.cidade === "italva" && !p.linha,
  },
];

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
          {GRUPOS.map(({ chave, titulo, ajuda, filtro }) => {
            const daCidade = lista.filter(filtro);
            if (chave === "ida-sem-linha" && daCidade.length === 0) return null;
            return (
              <div key={chave}>
                <h2 className="mb-1 font-semibold">{titulo}</h2>
                <p className="mb-2 text-xs text-slate-500">{ajuda}</p>
                {daCidade.length === 0 ? (
                  <Vazio icone={MapPin}>Nenhum ponto de {titulo.toLowerCase()}.</Vazio>
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
            <TipoPonto cidade={atual?.cidade} linha={atual?.linha} />
            <Campo rotulo="Ordem na rota" ajuda="Define a sequência da rota e a ordem da lista do motorista.">
              <Entrada name="ordem" type="number" min={0} defaultValue={atual?.ordem ?? 0} className="w-28" />
            </Campo>
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
