import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, FileText, GraduationCap, KeyRound, School, StickyNote, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { AreaTexto, BotaoLink, Campo, Entrada, Selecao, Selo, Titulo } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { CIDADES, SITUACOES_ALUNO, TURNOS, type Cidade, type Sentido } from "@/lib/rotulos";
import { dataHoraBR, hhmm } from "@/lib/tempo";
import { CamposDadosAluno } from "../campos-dados";
import {
  adicionarAnotacao,
  adicionarVinculo,
  alternarAcessoAluno,
  novaSenhaAluno,
  removerVinculo,
  salvarAluno,
} from "../acoes";
import { FormDocumentos } from "./form-documentos";
import { RotasAluno, type Rota } from "./rotas-aluno";

export const metadata: Metadata = { title: "Aluno" };

type Ponto = { id: string; nome: string; cidade: Cidade; ordem: number };
type Viagem = { id: string; cidade: Cidade; nome: string; sentido: Sentido; hora_saida: string; dias_semana: number[] };

export default async function PaginaAluno({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("semeduc");
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const [
    { data: usuario },
    { data: aluno },
    { data: vinculos },
    { data: pontosVolta },
    { data: rotasAluno },
    { data: instituicoes },
    { data: pontos },
    { data: viagens },
    { data: anotacoes },
  ] = await Promise.all([
    supabase.from("usuarios").select("nome, cpf, email, telefone, ativo, troca_senha_obrigatoria").eq("id", id).maybeSingle(),
    supabase.from("alunos").select("*").eq("usuario_id", id).maybeSingle(),
    supabase.from("aluno_vinculos").select("id, curso, periodo, turno, instituicao:instituicoes(nome, cidade)").eq("aluno_id", id),
    supabase.from("aluno_pontos_volta").select("cidade, ponto_id").eq("aluno_id", id),
    supabase.from("aluno_viagens").select("viagem_modelo_id").eq("aluno_id", id),
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
  const rotas: Rota[] = ((viagens ?? []) as Viagem[])
    .filter((v) => v.cidade === "campos" || v.cidade === "itaperuna")
    .map((v) => ({
      id: v.id,
      cidade: v.cidade as Rota["cidade"],
      nome: v.nome,
      sentido: v.sentido as Rota["sentido"],
      hora: hhmm(v.hora_saida),
      dias: v.dias_semana,
    }));
  const situacao = aluno.situacao as keyof typeof SITUACOES_ALUNO;
  const pontoVolta = (pontosVolta ?? [])[0]?.ponto_id ?? "";

  return (
    <>
      <Titulo
        icone={GraduationCap}
        descricao={`CPF ${formatarCpf(usuario.cpf)}`}
        acoes={
          <BotaoLink variante="secundario" href="/painel/alunos">
            <ArrowLeft /> Alunos
          </BotaoLink>
        }
      >
        <span className="flex flex-wrap items-center gap-2">
          {usuario.nome}
          <Selo cor={situacao === "ativo" ? "verde" : situacao === "pendente" ? "amarelo" : "cinza"}>{SITUACOES_ALUNO[situacao]}</Selo>
          {!usuario.ativo && <Selo cor="vermelho">acesso bloqueado</Selo>}
        </span>
      </Titulo>

      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Formulario acao={salvarAluno} className="gap-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-suave">
          <input type="hidden" name="id" value={id} />

          <Secao titulo="Dados do aluno">
            <CamposDadosAluno dados={{ ...usuario, ...aluno, cpf: formatarCpf(usuario.cpf) }} cpfFixo />
          </Secao>

          <Secao titulo="Pode usar o transporte?">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Situação">
                <Selecao name="situacao" defaultValue={situacao}>
                  {Object.entries(SITUACOES_ALUNO).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Matrícula válida até" ajuda="Sem esta data o aluno não consegue reservar.">
                <Entrada name="matricula_validade" type="date" defaultValue={aluno.matricula_validade ?? ""} />
              </Campo>
              <Campo rotulo="Motivo (só se devolver ou inativar)" className="sm:col-span-2">
                <Entrada name="motivo_devolucao" defaultValue={aluno.motivo_devolucao ?? ""} />
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Onde embarca">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Na ida (em Italva)">
                <Selecao name="ponto_ida_padrao_id" defaultValue={aluno.ponto_ida_padrao_id ?? ""}>
                  <option value="">— escolha —</option>
                  {listaPontos
                    .filter((p) => p.cidade === "italva")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Na volta (na faculdade)">
                <Selecao name="ponto_volta_id" defaultValue={pontoVolta}>
                  <option value="">— escolha —</option>
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
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Rotas que pode reservar">
            {rotas.length === 0 ? (
              <p className="text-sm text-amber-700">Nenhuma viagem modelo ativa. Cadastre em Transportes → Viagens modelo.</p>
            ) : (
              <RotasAluno rotas={rotas} selecionadas={(rotasAluno ?? []).map((r) => r.viagem_modelo_id)} />
            )}
          </Secao>

          <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-4">
            <BotaoEnviar className="h-11 px-8">Salvar aluno</BotaoEnviar>
          </div>
        </Formulario>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Mais opções</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-suave">
            <Expansivel icone={FileText} titulo="Foto e comprovante de matrícula">
              <div className="mb-4 flex items-start gap-4">
                {foto?.data?.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto.data.signedUrl} alt="Foto do aluno" className="h-28 w-24 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-28 w-24 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">sem foto</div>
                )}
                <div className="text-sm">
                  {comprovante?.data?.signedUrl ? (
                    <a href={comprovante.data.signedUrl} target="_blank" rel="noreferrer" className="text-azul-700 hover:underline">
                      Abrir comprovante
                    </a>
                  ) : (
                    <span className="text-slate-500">Sem comprovante</span>
                  )}
                </div>
              </div>
              <FormDocumentos alunoId={id} />
            </Expansivel>

            <Expansivel icone={School} titulo={`Faculdade e curso (${(vinculos ?? []).length})`}>
              <ul className="mb-4 flex flex-col gap-2">
                {(vinculos ?? []).length === 0 && <li className="text-sm text-slate-500">Nenhum curso cadastrado.</li>}
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
                      <AcaoRapida acao={removerVinculo} campos={{ id: v.id }} rotulo="Remover" icone={<Trash2 />} confirmar="Remover este curso?" />
                    </li>
                  );
                })}
              </ul>
              <Formulario acao={adicionarVinculo} limpar className="gap-3">
                <input type="hidden" name="aluno_id" value={id} />
                <div className="grid gap-2 sm:grid-cols-4">
                  <Campo rotulo="Faculdade" className="sm:col-span-2">
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
                  <Campo rotulo="Curso">
                    <Entrada name="curso" required />
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
                <div>
                  <BotaoEnviar variante="secundario">Adicionar curso</BotaoEnviar>
                </div>
              </Formulario>
            </Expansivel>

            <Expansivel icone={KeyRound} titulo="Senha e acesso ao app">
              <p className="mb-3 text-sm text-slate-600">
                O aluno entra com o CPF e a senha. {usuario.troca_senha_obrigatoria && "Ainda não trocou a senha provisória."}
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
            </Expansivel>

            <Expansivel icone={StickyNote} titulo={`Anotações da secretaria (${(anotacoes ?? []).length})`}>
              <Formulario acao={adicionarAnotacao} limpar className="mb-4 gap-2">
                <input type="hidden" name="aluno_id" value={id} />
                <AreaTexto name="texto" required placeholder="Ex.: advertido verbalmente em 23/10" />
                <div>
                  <BotaoEnviar variante="secundario">Registrar anotação</BotaoEnviar>
                </div>
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
            </Expansivel>
          </div>
        </section>
      </div>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-5 py-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{titulo}</h2>
      {children}
    </section>
  );
}

function Expansivel({ titulo, icone: Icone, children }: { titulo: string; icone: typeof FileText; children: ReactNode }) {
  return (
    <details className="group border-b border-slate-100 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-medium text-slate-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <Icone className="size-4 text-slate-400" />
        {titulo}
        <ChevronRight className="ml-auto size-4 text-slate-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
