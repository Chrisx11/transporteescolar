import type { Metadata } from "next";
import { ArrowLeft, CalendarPlus, School, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selo, Tabela, Titulo, Vazio } from "@/components/ui";
import { EditorCalendario, type DiaCalendario } from "@/components/calendario";
import { CIDADES, type Cidade } from "@/lib/rotulos";
import { dataBR, hojeSP, somarDias } from "@/lib/tempo";
import { excluirSemestre, salvarSemestre } from "../acoes";

export const metadata: Metadata = { title: "Calendário da instituição" };

export default async function PaginaInstituicao({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("semeduc");
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const hoje = hojeSP();

  const [{ data: inst }, { data: semestres }, { data: dias }] = await Promise.all([
    supabase.from("instituicoes").select("id, nome, cidade").eq("id", id).maybeSingle(),
    supabase.from("semestres").select("id, nome, inicio, fim").eq("instituicao_id", id).order("inicio", { ascending: false }),
    supabase
      .from("calendario")
      .select("id, data, tipo, descricao")
      .eq("instituicao_id", id)
      .gte("data", somarDias(hoje, -30))
      .order("data"),
  ]);
  if (!inst) notFound();

  return (
    <>
      <Titulo icone={School}
        descricao={CIDADES[inst.cidade as Cidade]}
        acoes={
          <BotaoLink variante="secundario" href="/painel/instituicoes">
            <ArrowLeft /> Instituições
          </BotaoLink>
        }
      >
        {inst.nome}
      </Titulo>

      <h2 className="mb-2 text-lg font-semibold">Semestres</h2>
      <p className="mb-3 text-sm text-slate-600">Fora do semestre, os alunos ligados a esta instituição não têm transporte.</p>
      <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_320px]">
        {(semestres ?? []).length === 0 ? (
          <Vazio>Nenhum semestre cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Semestre</th>
                <th>Início</th>
                <th>Fim</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(semestres ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.nome}</td>
                  <td>{dataBR(s.inicio)}</td>
                  <td>{dataBR(s.fim)}</td>
                  <td>{s.inicio <= hoje && s.fim >= hoje && <Selo cor="verde">vigente</Selo>}</td>
                  <td>
                    <AcaoRapida acao={excluirSemestre} campos={{ id: s.id }} rotulo="Remover"
 icone={<Trash2 />} confirmar="Remover este semestre?" />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        <Cartao titulo="Novo semestre" icone={CalendarPlus}>
          <Formulario acao={salvarSemestre} limpar>
            <input type="hidden" name="instituicao_id" value={inst.id} />
            <Campo rotulo="Nome">
              <Entrada name="nome" required placeholder="Ex.: 2027.1" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Início">
                <Entrada name="inicio" type="date" required />
              </Campo>
              <Campo rotulo="Fim">
                <Entrada name="fim" type="date" required />
              </Campo>
            </div>
            <BotaoEnviar>Adicionar semestre</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Dias sem aula e recessos desta instituição</h2>
      <p className="mb-3 text-sm text-slate-600">
        Feriados gerais ficam em <strong>Feriados e recessos</strong> e valem para todas.
      </p>
      <EditorCalendario dias={(dias ?? []) as DiaCalendario[]} instituicaoId={inst.id} titulo="Novo dia sem aula" />
    </>
  );
}
