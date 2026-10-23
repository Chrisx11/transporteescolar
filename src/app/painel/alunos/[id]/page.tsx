import type { Metadata } from "next";
import { ArrowLeft, BadgeCheck, CalendarRange, FileText, GraduationCap, KeyRound, MapPin, School, StickyNote, Trash2, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { AreaTexto, Aviso, BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Titulo } from "@/components/ui";
import { Validade } from "@/components/validade";
import { formatarCpf } from "@/lib/cpf";
import { CIDADES, SITUACOES_ALUNO, TURNOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { DIAS_SEMANA, dataHoraBR, hhmm } from "@/lib/tempo";
import { CamposDadosAluno } from "../campos-dados";
import {
  adicionarAnotacao,
  adicionarVinculo,
  alterarSituacao,
  alternarAcessoAluno,
  novaSenhaAluno,
  removerVinculo,
  salvarDadosAluno,
  salvarGrade,
  salvarPontosPadrao,
} from "../acoes";
import { FormDocumentos } from "./form-documentos";

export const metadata: Metadata = { title: "Aluno" };

type Ponto = { id: string; nome: string; cidade: Cidade; ordem: number };
type Viagem = { id: string; cidade: Cidade; nome: string; sentido: Sentido; hora_saida: string; dias_semana: number[] };
type Grade = {
  dia_semana: number;
  viagem_ida_modelo_id: string | null;
  viagem_volta_modelo_id: string | null;
  ponto_ida_id: string | null;
  ponto_volta_id: string | null;
  instituicao_id: string | null;
};

export default async function PaginaAluno({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("semeduc");
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [
    { data: usuario },
    { data: aluno },
    { data: vinculos },
    { data: pontosVolta },
    { data: grade },
    { data: instituicoes },
    { data: pontos },
    { data: viagens },
    { data: anotacoes },
  ] = await Promise.all([
    supabase.from("usuarios").select("nome, cpf, email, telefone, ativo, troca_senha_obrigatoria").eq("id", id).maybeSingle(),
    supabase.from("alunos").select("*").eq("usuario_id", id).maybeSingle(),
    supabase.from("aluno_vinculos").select("id, curso, periodo, turno, instituicao:instituicoes(nome, cidade)").eq("aluno_id", id),
    supabase.from("aluno_pontos_volta").select("cidade, ponto_id").eq("aluno_id", id),
    supabase.from("grade_semanal").select("*").eq("aluno_id", id),
    supabase.from("instituicoes").select("id, nome, cidade").eq("ativa", true).order("nome"),
    supabase.from("pontos").select("id, nome, cidade, ordem").eq("ativo", true).order("ordem"),
    supabase
      .from("viagens_modelo")
      .select("id, cidade, nome, sentido, hora_saida, dias_semana")
      .eq("ativa", true)
      .in("sentido", ["ida", "volta"])
      .order("hora_saida"),
    supabase
      .from("anotacoes_aluno")
      .select("id, texto, criado_em, autor:usuarios(nome)")
      .eq("aluno_id", id)
      .order("criado_em", { ascending: false }),
  ]);
  if (!usuario || !aluno) notFound();

  const [foto, comprovante] = await Promise.all([
    aluno.foto_path ? supabase.storage.from("fotos").createSignedUrl(aluno.foto_path, 3600) : null,
    aluno.comprovante_path ? supabase.storage.from("documentos").createSignedUrl(aluno.comprovante_path, 3600) : null,
  ]);

  const listaPontos = (pontos ?? []) as Ponto[];
  const listaViagens = (viagens ?? []) as Viagem[];
  const listaGrade = (grade ?? []) as Grade[];
  const pontosItalva = listaPontos.filter((p) => p.cidade === "italva");
  const voltaDe = (c: string) => (pontosVolta ?? []).find((p) => p.cidade === c)?.ponto_id ?? "";
  const diasGrade = DIAS_SEMANA.filter((d) => d.valor <= 6 || listaViagens.some((v) => v.dias_semana.includes(7)));
  const rotuloViagem = (v: Viagem) => `${v.cidade === "campos" ? "Campos" : "Itaperuna"} · ${v.nome} (${hhmm(v.hora_saida)})`;
  const situacao = aluno.situacao as keyof typeof SITUACOES_ALUNO;

  return (
    <>
      <Titulo icone={GraduationCap}
        descricao={`CPF ${formatarCpf(usuario.cpf)}`}
        acoes={
          <BotaoLink variante="secundario" href="/painel/alunos">
            <ArrowLeft /> Alunos
          </BotaoLink>
        }
      >
        <span className="flex flex-wrap items-center gap-2">
          {usuario.nome}
          <Selo cor={situacao === "ativo" ? "verde" : situacao === "pendente" ? "amarelo" : "cinza"}>
            {SITUACOES_ALUNO[situacao]}
          </Selo>
          {!usuario.ativo && <Selo cor="vermelho">acesso bloqueado</Selo>}
        </span>
      </Titulo>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Situação */}
        <Cartao titulo="Situação do cadastro" icone={BadgeCheck}>
          <Formulario acao={alterarSituacao}>
            <input type="hidden" name="id" value={id} />
            <Campo rotulo="Situação" ajuda="Só alunos ativos e com matrícula válida podem reservar.">
              <Selecao name="situacao" defaultValue={situacao}>
                {Object.entries(SITUACOES_ALUNO).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Motivo (se devolver ou inativar)">
              <AreaTexto name="motivo_devolucao" defaultValue={aluno.motivo_devolucao ?? ""} />
            </Campo>
            <BotaoEnviar>Salvar situação</BotaoEnviar>
          </Formulario>
        </Cartao>

        {/* Documentos */}
        <Cartao titulo="Foto e comprovante de matrícula" icone={FileText}>
          <div className="mb-4 flex items-start gap-4">
            {foto?.data?.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.data.signedUrl} alt="Foto do aluno" className="h-28 w-24 rounded-lg object-cover" />
            ) : (
              <div className="flex h-28 w-24 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                sem foto
              </div>
            )}
            <div className="flex flex-col gap-2 text-sm">
              <span>
                Matrícula válida até: <Validade data={aluno.matricula_validade} diasAviso={15} />
              </span>
              {comprovante?.data?.signedUrl ? (
                <a href={comprovante.data.signedUrl} target="_blank" rel="noreferrer" className="text-azul-700 hover:underline">
                  Abrir comprovante
                </a>
              ) : (
                <span className="text-slate-500">Sem comprovante</span>
              )}
            </div>
          </div>
          <FormDocumentos alunoId={id} validade={aluno.matricula_validade} />
        </Cartao>

        {/* Dados pessoais */}
        <Cartao titulo="Dados pessoais" icone={UserRound} className="lg:col-span-2">
          <Formulario acao={salvarDadosAluno}>
            <input type="hidden" name="id" value={id} />
            <CamposDadosAluno dados={{ ...usuario, ...aluno, cpf: formatarCpf(usuario.cpf) }} cpfFixo />
            <div>
              <BotaoEnviar>Salvar dados</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>

        {/* Vínculos */}
        <Cartao titulo="Vínculos acadêmicos" icone={School}>
          <ul className="mb-4 flex flex-col gap-2">
            {(vinculos ?? []).length === 0 && <li className="text-sm text-slate-500">Nenhum vínculo.</li>}
            {(vinculos ?? []).map((v) => {
              const inst = v.instituicao as unknown as { nome: string; cidade: Cidade } | null;
              return (
                <li key={v.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <strong>{inst?.nome}</strong> ({inst ? CIDADES[inst.cidade] : ""})
                    <br />
                    {v.curso}
                    {v.periodo ? ` · ${v.periodo}` : ""} · {TURNOS[v.turno as keyof typeof TURNOS]}
                  </span>
                  <AcaoRapida acao={removerVinculo} campos={{ id: v.id }} rotulo="Remover"
 icone={<Trash2 />} confirmar="Remover este vínculo?" />
                </li>
              );
            })}
          </ul>
          <Formulario acao={adicionarVinculo} limpar className="gap-3">
            <input type="hidden" name="aluno_id" value={id} />
            <Campo rotulo="Instituição">
              <Selecao name="instituicao_id" required defaultValue="">
                <option value="" disabled>
                  Escolha…
                </option>
                {(instituicoes ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} ({CIDADES[i.cidade as Cidade]})
                  </option>
                ))}
              </Selecao>
            </Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo rotulo="Curso" className="col-span-3 sm:col-span-1">
                <Entrada name="curso" required />
              </Campo>
              <Campo rotulo="Período">
                <Entrada name="periodo" placeholder="Ex.: 3º" />
              </Campo>
              <Campo rotulo="Turno">
                <Selecao name="turno" defaultValue="noite">
                  {Object.entries(TURNOS).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            </div>
            <BotaoEnviar variante="secundario">Adicionar vínculo</BotaoEnviar>
          </Formulario>
        </Cartao>

        {/* Pontos padrão */}
        <Cartao titulo="Pontos padrão" icone={MapPin}>
          <Formulario acao={salvarPontosPadrao}>
            <input type="hidden" name="id" value={id} />
            <Campo rotulo="Embarque da ida (Italva)">
              <Selecao name="ponto_ida_padrao_id" defaultValue={aluno.ponto_ida_padrao_id ?? ""}>
                <option value="">— não definido —</option>
                {pontosItalva.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {(["campos", "itaperuna"] as Cidade[]).map((c) => (
              <Campo key={c} rotulo={`Embarque da volta (${CIDADES[c]})`}>
                <Selecao name={`volta_${c}`} defaultValue={voltaDe(c)}>
                  <option value="">— não frequenta / não definido —</option>
                  {listaPontos
                    .filter((p) => p.cidade === c)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                </Selecao>
              </Campo>
            ))}
            <BotaoEnviar>Salvar pontos</BotaoEnviar>
          </Formulario>
        </Cartao>

        {/* Grade semanal */}
        <Cartao titulo="Grade semanal" icone={CalendarRange} className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-600">
            Para cada dia, a ida e a volta que o aluno pode reservar. Ponto e instituição do dia são opcionais: sem ponto,
            vale o ponto padrão; a instituição faz valer os dias sem aula dela.
          </p>
          {listaViagens.length === 0 && <Aviso tipo="alerta">Nenhuma viagem modelo ativa cadastrada.</Aviso>}
          <Formulario acao={salvarGrade}>
            <input type="hidden" name="id" value={id} />
            <div className="overflow-x-auto">
              <table className="tabela w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Ida</th>
                    <th>Volta</th>
                    <th>Ponto da ida</th>
                    <th>Ponto da volta</th>
                    <th>Instituição</th>
                  </tr>
                </thead>
                <tbody>
                  {diasGrade.map((d) => {
                    const g = listaGrade.find((x) => x.dia_semana === d.valor);
                    const doDia = listaViagens.filter((v) => v.dias_semana.includes(d.valor));
                    return (
                      <tr key={d.valor}>
                        <td className="font-medium">{d.nome}</td>
                        <td>
                          <Selecao name={`ida_${d.valor}`} defaultValue={g?.viagem_ida_modelo_id ?? ""}>
                            <option value="">— nenhuma —</option>
                            {doDia
                              .filter((v) => v.sentido === "ida")
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {rotuloViagem(v)}
                                </option>
                              ))}
                          </Selecao>
                        </td>
                        <td>
                          <Selecao name={`volta_${d.valor}`} defaultValue={g?.viagem_volta_modelo_id ?? ""}>
                            <option value="">— nenhuma —</option>
                            {doDia
                              .filter((v) => v.sentido === "volta")
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {rotuloViagem(v)}
                                </option>
                              ))}
                          </Selecao>
                        </td>
                        <td>
                          <Selecao name={`ponto_ida_${d.valor}`} defaultValue={g?.ponto_ida_id ?? ""}>
                            <option value="">padrão</option>
                            {pontosItalva.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                              </option>
                            ))}
                          </Selecao>
                        </td>
                        <td>
                          <Selecao name={`ponto_volta_${d.valor}`} defaultValue={g?.ponto_volta_id ?? ""}>
                            <option value="">padrão</option>
                            {(["campos", "itaperuna"] as Cidade[]).map((c) => (
                              <optgroup key={c} label={CIDADES[c]}>
                                {listaPontos
                                  .filter((p) => p.cidade === c)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.nome}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </Selecao>
                        </td>
                        <td>
                          <Selecao name={`inst_${d.valor}`} defaultValue={g?.instituicao_id ?? ""}>
                            <option value="">—</option>
                            {(instituicoes ?? []).map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nome}
                              </option>
                            ))}
                          </Selecao>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <BotaoEnviar>Salvar grade</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>

        {/* Acesso */}
        <Cartao titulo="Acesso ao app" icone={KeyRound}>
          <p className="mb-3 text-sm text-slate-600">
            O aluno entra com o CPF e a senha.{" "}
            {usuario.troca_senha_obrigatoria && "Ainda não trocou a senha provisória."}
          </p>
          <div className="flex flex-wrap gap-3">
            <AcaoRapida
              acao={novaSenhaAluno}
              campos={{ id }}
              rotulo="Gerar nova senha provisória"
 icone={<KeyRound />}
              variante="secundario"
              confirmar="Gerar uma nova senha provisória? A senha atual deixa de funcionar."
            />
            <AcaoRapida
              acao={alternarAcessoAluno}
              campos={{ id, ativo: String(!usuario.ativo) }}
              rotulo={usuario.ativo ? "Bloquear acesso" : "Liberar acesso"}
              variante={usuario.ativo ? "perigo" : "secundario"}
            />
          </div>
        </Cartao>

        {/* Anotações */}
        <Cartao titulo="Anotações da secretaria" icone={StickyNote}>
          <Formulario acao={adicionarAnotacao} limpar className="mb-4 gap-2">
            <input type="hidden" name="aluno_id" value={id} />
            <AreaTexto name="texto" required placeholder="Ex.: advertido verbalmente em 23/10" />
            <BotaoEnviar variante="secundario">Registrar anotação</BotaoEnviar>
          </Formulario>
          <ul className="flex flex-col gap-2 text-sm">
            {(anotacoes ?? []).map((a) => (
              <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <p>{a.texto}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {(a.autor as unknown as { nome: string } | null)?.nome} · {dataHoraBR(a.criado_em)}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}
