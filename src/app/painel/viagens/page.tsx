import type { Metadata } from "next";
import { Pencil, Plus, Route, Trash2 } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo, LinkAcao } from "@/components/ui";
import { CIDADES, PRAZO_TIPOS, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { DIAS_SEMANA, hhmm } from "@/lib/tempo";
import { excluirViagemModelo, salvarViagemModelo } from "./acoes";

export const metadata: Metadata = { title: "Viagens modelo" };

type ViagemModelo = {
  id: string;
  cidade: Cidade;
  nome: string;
  sentido: Sentido;
  hora_saida: string;
  duracao_min: number;
  prazo_tipo: keyof typeof PRAZO_TIPOS | null;
  prazo_hora: string | null;
  dias_semana: number[];
  condicional: boolean;
  bloqueia_ao_lotar: boolean;
  km_estimado: number | null;
  ativa: boolean;
};

function textoPrazo(v: ViagemModelo) {
  if (v.sentido === "deslocamento_vazio") return "Não reservável";
  if (v.condicional) return "Condicional (liberada pelo motorista)";
  return `${hhmm(v.prazo_hora)} ${v.prazo_tipo === "dia_anterior" ? "do dia anterior" : "do mesmo dia"}`;
}

function textoDias(dias: number[]) {
  const ordenados = [...dias].sort((a, b) => a - b);
  const seguidos = ordenados.every((d, i) => i === 0 || d === ordenados[i - 1] + 1);
  const curto = (n: number) => DIAS_SEMANA.find((d) => d.valor === n)?.curto;
  if (ordenados.length === 7) return "Todos os dias";
  if (seguidos && ordenados.length > 2) return `${curto(ordenados[0])} a ${curto(ordenados[ordenados.length - 1])}`;
  return ordenados.map(curto).join(", ");
}

export default async function PaginaViagens({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await exigirPerfil("semtransp");
  const { editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("viagens_modelo").select("*").order("cidade").order("hora_saida");
  const lista = (data ?? []) as ViagemModelo[];
  const atual = lista.find((v) => v.id === editar);

  return (
    <>
      <Titulo icone={Route} descricao="Grade geral de viagens. As viagens de cada dia serão geradas a partir daqui (Fase 2).">
        Viagens modelo
      </Titulo>
      <div className="grid items-start gap-6 2xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          {(["campos", "itaperuna"] as Cidade[]).map((cidade) => (
            <div key={cidade}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{CIDADES[cidade]}</h2>
              <Tabela>
                <thead>
                  <tr>
                    <th>Saída</th>
                    <th>Viagem</th>
                    <th>Prazo de reserva e cancelamento</th>
                    <th>Dias</th>
                    <th>Km</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista
                    .filter((v) => v.cidade === cidade)
                    .map((v) => (
                      <tr key={v.id} className={v.ativa ? "" : "opacity-50"}>
                        <td className="font-semibold">{hhmm(v.hora_saida)}</td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1">
                            {v.nome}
                            <Selo cor={v.sentido === "ida" ? "azul" : v.sentido === "volta" ? "verde" : "cinza"}>
                              {SENTIDOS[v.sentido]}
                            </Selo>
                            {v.bloqueia_ao_lotar && <Selo cor="amarelo">bloqueia ao lotar</Selo>}
                            {!v.ativa && <Selo>inativa</Selo>}
                          </div>
                        </td>
                        <td>{textoPrazo(v)}</td>
                        <td className="whitespace-nowrap text-xs text-slate-600">{textoDias(v.dias_semana)}</td>
                        <td>{v.km_estimado ?? <span className="text-xs text-amber-700">preencher</span>}</td>
                        <td>
                          <div className="flex items-start gap-2">
                            <LinkAcao icone={Pencil} href={`/painel/viagens?editar=${v.id}`}>Editar</LinkAcao>
                            <AcaoRapida
                              acao={excluirViagemModelo}
                              campos={{ id: v.id }}
                              rotulo="Excluir"
 icone={<Trash2 />}
                              confirmar={`Excluir "${v.nome}"? Se já estiver em uso, prefira desativar.`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Tabela>
            </div>
          ))}
        </div>

        <Cartao
          icone={atual ? Pencil : Plus}
          titulo={atual ? `Editar ${atual.nome}` : "Nova viagem modelo"}
          acoes={
            atual && (
              <BotaoLink variante="link" href="/painel/viagens">
                Cancelar
              </BotaoLink>
            )
          }
        >
          <Formulario key={atual?.id ?? "nova"} acao={salvarViagemModelo} limpar={!atual}>
            {atual && <input type="hidden" name="id" value={atual.id} />}
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Cidade">
                <Selecao name="cidade" defaultValue={atual?.cidade ?? "campos"}>
                  <option value="campos">{CIDADES.campos}</option>
                  <option value="itaperuna">{CIDADES.itaperuna}</option>
                </Selecao>
              </Campo>
              <Campo rotulo="Sentido">
                <Selecao name="sentido" defaultValue={atual?.sentido ?? "ida"}>
                  {Object.entries(SENTIDOS).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            </div>
            <Campo rotulo="Nome">
              <Entrada name="nome" defaultValue={atual?.nome} required placeholder="Ex.: Ida manhã" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Saída">
                <Entrada name="hora_saida" type="time" defaultValue={hhmm(atual?.hora_saida)} required />
              </Campo>
              <Campo rotulo="Duração (min)" ajuda="Para evitar conflito na escala.">
                <Entrada name="duracao_min" type="number" min={1} defaultValue={atual?.duracao_min ?? 75} required />
              </Campo>
            </div>
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Prazo de reserva e cancelamento</legend>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Dia">
                  <Selecao name="prazo_tipo" defaultValue={atual?.prazo_tipo ?? "mesmo_dia"}>
                    {Object.entries(PRAZO_TIPOS).map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Hora">
                  <Entrada name="prazo_hora" type="time" defaultValue={hhmm(atual?.prazo_hora)} />
                </Campo>
              </div>
              <p className="mt-2 text-xs text-slate-500">Ignorado em viagens condicionais e deslocamentos vazios.</p>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">Dias em que opera</legend>
              <div className="flex flex-wrap gap-3">
                {DIAS_SEMANA.map((d) => (
                  <label key={d.valor} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      name="dias_semana"
                      value={d.valor}
                      defaultChecked={(atual?.dias_semana ?? [1, 2, 3, 4, 5, 6]).includes(d.valor)}
                      className="size-4 accent-azul-600"
                    />
                    {d.curto}
                  </label>
                ))}
              </div>
            </fieldset>
            <Campo rotulo="Km estimado (para relatórios)">
              <Entrada name="km_estimado" inputMode="decimal" defaultValue={atual?.km_estimado ?? ""} />
            </Campo>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="condicional" defaultChecked={atual?.condicional} className="size-4 accent-azul-600" />
                Condicional (só acontece se o motorista liberar)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="bloqueia_ao_lotar"
                  defaultChecked={atual?.bloqueia_ao_lotar}
                  className="size-4 accent-azul-600"
                />
                Bloquear reservas ao lotar (só voltas)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="ativa" defaultChecked={atual?.ativa ?? true} className="size-4 accent-azul-600" />
                Viagem ativa
              </label>
            </div>
            <BotaoEnviar>{atual ? "Salvar alterações" : "Cadastrar viagem"}</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
