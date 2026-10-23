import type { Metadata } from "next";
import { Pencil, Plus, School, Trash2 } from "lucide-react";
import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo, Vazio, LinkAcao } from "@/components/ui";
import { CIDADES, type Cidade } from "@/lib/rotulos";
import { dataBR, hojeSP } from "@/lib/tempo";
import { excluirInstituicao, salvarInstituicao } from "./acoes";

export const metadata: Metadata = { title: "Instituições" };

type Instituicao = {
  id: string;
  nome: string;
  cidade: Cidade;
  endereco: string | null;
  ativa: boolean;
  semestres: { inicio: string; fim: string }[];
  aluno_vinculos: { count: number }[];
};

export default async function PaginaInstituicoes({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await exigirPerfil("semeduc");
  const { editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("instituicoes")
    .select("id, nome, cidade, endereco, ativa, semestres(inicio, fim), aluno_vinculos(count)")
    .order("cidade")
    .order("nome");
  const lista = (data ?? []) as unknown as Instituicao[];
  const atual = lista.find((i) => i.id === editar);
  const hoje = hojeSP();

  return (
    <>
      <Titulo icone={School} descricao="Faculdades e universidades atendidas, com o calendário letivo de cada uma.">Instituições</Titulo>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {lista.length === 0 ? (
          <Vazio icone={School}>Nenhuma instituição cadastrada.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Instituição</th>
                <th>Cidade</th>
                <th>Semestre atual</th>
                <th>Vínculos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const atualSem = i.semestres.find((s) => s.inicio <= hoje && s.fim >= hoje);
                return (
                  <tr key={i.id} className={i.ativa ? "" : "opacity-50"}>
                    <td>
                      <Link href={`/painel/instituicoes/${i.id}`} className="font-medium text-azul-700 hover:underline">
                        {i.nome}
                      </Link>
                      {i.endereco && <p className="text-xs text-slate-500">{i.endereco}</p>}
                    </td>
                    <td>{CIDADES[i.cidade]}</td>
                    <td>
                      {atualSem ? (
                        `${dataBR(atualSem.inicio)} a ${dataBR(atualSem.fim)}`
                      ) : (
                        <Selo cor="amarelo">sem semestre vigente</Selo>
                      )}
                    </td>
                    <td>{i.aluno_vinculos[0]?.count ?? 0}</td>
                    <td>
                      <div className="flex items-start gap-2">
                        <LinkAcao icone={Pencil} href={`/painel/instituicoes?editar=${i.id}`}>Editar</LinkAcao>
                        <AcaoRapida
                          acao={excluirInstituicao}
                          campos={{ id: i.id }}
                          rotulo="Excluir"
 icone={<Trash2 />}
                          confirmar={`Excluir "${i.nome}"?`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}

        <Cartao
          icone={atual ? Pencil : Plus}
          titulo={atual ? "Editar instituição" : "Nova instituição"}
          acoes={
            atual && (
              <BotaoLink variante="link" href="/painel/instituicoes">
                Cancelar
              </BotaoLink>
            )
          }
        >
          <Formulario key={atual?.id ?? "nova"} acao={salvarInstituicao} limpar={!atual}>
            {atual && <input type="hidden" name="id" value={atual.id} />}
            <Campo rotulo="Nome">
              <Entrada name="nome" defaultValue={atual?.nome} required placeholder="Ex.: UENF" />
            </Campo>
            <Campo rotulo="Cidade">
              <Selecao name="cidade" defaultValue={atual?.cidade ?? "campos"}>
                <option value="campos">{CIDADES.campos}</option>
                <option value="itaperuna">{CIDADES.itaperuna}</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Endereço">
              <Entrada name="endereco" defaultValue={atual?.endereco ?? ""} />
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ativa" defaultChecked={atual?.ativa ?? true} className="size-4 accent-azul-600" />
              Instituição ativa
            </label>
            <BotaoEnviar>{atual ? "Salvar alterações" : "Cadastrar instituição"}</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
