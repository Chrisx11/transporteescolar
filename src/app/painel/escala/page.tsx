import type { Metadata } from "next";
import { CalendarRange, Trash2 } from "lucide-react";
import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { Aviso, Cartao, Selecao, Selo, Titulo, cx } from "@/components/ui";
import { CIDADES, SENTIDOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { DIAS_SEMANA, hhmm } from "@/lib/tempo";
import { adicionarEscala, copiarEscala, removerEscala } from "./acoes";

export const metadata: Metadata = { title: "Escala semanal" };

type Viagem = { id: string; cidade: Cidade; nome: string; sentido: Sentido; hora_saida: string; dias_semana: number[] };
type Item = {
  id: string;
  viagem_modelo_id: string;
  onibus: { prefixo: string; capacidade: number; situacao: string } | null;
  motorista: { usuario: { nome: string } | null } | null;
};

export default async function PaginaEscala({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  await exigirPerfil("semtransp");
  const dia = Math.min(7, Math.max(1, Number((await searchParams).dia) || 1));
  const supabase = await criarClienteServidor();

  const [{ data: viagens }, { data: itens }, { data: onibus }, { data: motoristas }] = await Promise.all([
    supabase
      .from("viagens_modelo")
      .select("id, cidade, nome, sentido, hora_saida, dias_semana")
      .eq("ativa", true)
      .contains("dias_semana", [dia])
      .order("hora_saida"),
    supabase
      .from("escala_modelo")
      .select("id, viagem_modelo_id, onibus(prefixo, capacidade, situacao), motorista:motoristas(usuario:usuarios(nome))")
      .eq("dia_semana", dia),
    supabase.from("onibus").select("id, prefixo, capacidade, situacao").order("prefixo"),
    supabase.from("motoristas").select("usuario_id, usuario:usuarios(nome, ativo)"),
  ]);

  const listaViagens = (viagens ?? []) as Viagem[];
  const listaItens = (itens ?? []) as unknown as Item[];
  const listaMotoristas = ((motoristas ?? []) as unknown as { usuario_id: string; usuario: { nome: string; ativo: boolean } }[])
    .filter((m) => m.usuario.ativo)
    .sort((a, b) => a.usuario.nome.localeCompare(b.usuario.nome, "pt-BR"));
  const semEscala = listaViagens.filter((v) => !listaItens.some((i) => i.viagem_modelo_id === v.id));

  return (
    <>
      <Titulo icone={CalendarRange} descricao="Quais ônibus e motoristas fazem cada viagem em cada dia da semana. Pode ser ajustada no dia (Fase 2).">
        Escala semanal
      </Titulo>

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {DIAS_SEMANA.map((d) => (
          <Link
            key={d.valor}
            href={`/painel/escala?dia=${d.valor}`}
            className={cx(
              "rounded-lg px-4 py-2 text-sm font-medium",
              d.valor === dia ? "bg-white text-azul-800 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {d.nome}
          </Link>
        ))}
      </div>

      {semEscala.length > 0 && (
        <div className="mb-4">
          <Aviso tipo="alerta">
            {semEscala.length} viagem(ns) sem ônibus neste dia:{" "}
            {semEscala.map((v) => `${v.nome} (${CIDADES[v.cidade]})`).join(", ")}.
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {listaViagens.map((v) => {
          const daViagem = listaItens.filter((i) => i.viagem_modelo_id === v.id);
          const capacidade = daViagem.reduce((s, i) => s + (i.onibus?.capacidade ?? 0), 0);
          return (
            <Cartao
              key={v.id}
              titulo={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg">{hhmm(v.hora_saida)}</span>
                  {v.nome}
                  <Selo cor={v.sentido === "ida" ? "azul" : v.sentido === "volta" ? "verde" : "cinza"}>
                    {SENTIDOS[v.sentido]}
                  </Selo>
                </span>
              }
              acoes={<span className="text-xs text-slate-500">{CIDADES[v.cidade]}</span>}
            >
              <ul className="mb-3 flex flex-col gap-2">
                {daViagem.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>
                      <strong>Ônibus {i.onibus?.prefixo}</strong> ({i.onibus?.capacidade} lugares)
                      {i.onibus?.situacao === "manutencao" && (
                        <>
                          {" "}
                          <Selo cor="amarelo">em manutenção</Selo>
                        </>
                      )}
                      <br />
                      <span className="text-slate-600">
                        {i.motorista?.usuario?.nome ?? <em className="text-amber-700">sem motorista</em>}
                      </span>
                    </span>
                    <AcaoRapida acao={removerEscala} campos={{ id: i.id }} rotulo="Remover"
 icone={<Trash2 />} />
                  </li>
                ))}
                {daViagem.length > 0 && (
                  <li className="text-xs text-slate-500">Capacidade total: {capacidade} lugares</li>
                )}
              </ul>
              <Formulario acao={adicionarEscala} className="gap-2">
                <input type="hidden" name="viagem_modelo_id" value={v.id} />
                <input type="hidden" name="dia_semana" value={dia} />
                <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                  <Selecao name="onibus_id" required defaultValue="" aria-label="Ônibus">
                    <option value="" disabled>
                      Ônibus…
                    </option>
                    {(onibus ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.prefixo} ({o.capacidade}){o.situacao === "manutencao" ? " – manutenção" : ""}
                      </option>
                    ))}
                  </Selecao>
                  <Selecao name="motorista_id" defaultValue="" aria-label="Motorista">
                    <option value="">Motorista…</option>
                    {listaMotoristas.map((m) => (
                      <option key={m.usuario_id} value={m.usuario_id}>
                        {m.usuario.nome}
                      </option>
                    ))}
                  </Selecao>
                  <BotaoEnviar variante="secundario" className="px-3">
                    Adicionar
                  </BotaoEnviar>
                </div>
              </Formulario>
            </Cartao>
          );
        })}
      </div>

      <Cartao titulo="Copiar a escala deste dia" className="mt-6 max-w-xl">
        <Formulario acao={copiarEscala} confirmar="A escala do dia de destino será substituída. Continuar?">
          <input type="hidden" name="origem" value={dia} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Copiar <strong>{DIAS_SEMANA.find((d) => d.valor === dia)?.nome}</strong> para
            </span>
            <Selecao name="destino" className="w-48" defaultValue="">
              <option value="" disabled>
                escolha o dia…
              </option>
              {DIAS_SEMANA.filter((d) => d.valor !== dia).map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.nome}
                </option>
              ))}
            </Selecao>
            <BotaoEnviar variante="secundario">Copiar</BotaoEnviar>
          </div>
        </Formulario>
      </Cartao>
    </>
  );
}
