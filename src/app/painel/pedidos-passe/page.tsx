import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Search, ChevronRight, ExternalLink, Mail, MailCheck, Send, UserRoundPlus, XCircle } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { Botao, BotaoLink, Campo, Entrada, Selo, Titulo, Vazio, cx } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { CIDADES, TURNOS, type Cidade } from "@/lib/rotulos";
import { dataBR, dataHoraBR } from "@/lib/tempo";
import { AcaoRapida } from "@/components/formulario";
import { emailConfigurado, loteDeEnvio } from "@/lib/email";

// Enviar um lote de e-mails pelo Gmail pode levar alguns segundos.
export const maxDuration = 60;
import { aprovarPreCadastro, enviarLinkPedido, enviarLinksNaoEnviados, recusarPreCadastro } from "./acoes";
import { CopiarLink } from "./copiar-link";
import { CarregandoLink } from "@/components/carregando-link";

export const metadata: Metadata = { title: "Pedidos de passe" };

type Pedido = {
  id: string;
  nome: string;
  cpf: string;
  data_nascimento: string | null;
  telefone: string;
  email: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: Cidade;
  instituicao_outra: string | null;
  curso: string;
  periodo: string | null;
  turno: keyof typeof TURNOS;
  cpf_path: string;
  comprovante_path: string;
  residencia_path: string | null;
  foto_path: string | null;
  status: "aguardando" | "pendente" | "aprovado" | "recusado";
  origem: "site" | "planilha";
  linha: string | null;
  dias: string | null;
  observacao: string | null;
  email_enviado_em: string | null;
  email_erro: string | null;
  codigo_expira_em: string | null;
  motivo: string | null;
  aluno_id: string | null;
  analisado_em: string | null;
  criado_em: string;
  instituicao: { nome: string } | null;
};

const ABAS = [
  { chave: "aguardando", rotulo: "Aguardando complemento" },
  { chave: "pendente", rotulo: "Esperando análise" },
  { chave: "aprovado", rotulo: "Aprovados" },
  { chave: "recusado", rotulo: "Recusados" },
] as const;

/** Pedidos de passe: cadastros feitos pelos alunos no formulário público (/cadastro). */
const POR_PAGINA = 50;
const COLUNAS_BASE = "id, nome, cpf, telefone, email, cidade, instituicao_outra, curso, periodo, turno, status, origem, linha, dias, observacao, criado_em, instituicao:instituicoes(nome)";
const COLUNAS = {
  aguardando: "id, nome, telefone, email, cidade, instituicao_outra, curso, linha, dias, email_enviado_em, email_erro, instituicao:instituicoes(nome)",
  pendente: `${COLUNAS_BASE}, data_nascimento, endereco, bairro, cpf_path, comprovante_path, residencia_path, foto_path`,
  aprovado: `${COLUNAS_BASE}, aluno_id, analisado_em`,
  recusado: `${COLUNAS_BASE}, motivo, analisado_em`,
} as const;

/** Pedidos de passe: cadastros feitos pelos alunos no formulário público (/cadastro). */
export default async function PaginaPedidosPasse({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; pagina?: string }> }) {
  await exigirPerfil("semeduc");
  const { aba: pedida, q = "", pagina = "1" } = await searchParams;
  const aba = ABAS.find((a) => a.chave === pedida)?.chave ?? "pendente";
  const pag = Math.max(1, Number(pagina) || 1);
  const termo = q.trim().replace(/[%_,()]/g, "");
  const supabase = await criarClienteServidor();

  // Só as colunas que a aba mostra, 50 por página, com busca por nome, e-mail ou telefone.
  let consulta = supabase
    .from("pre_cadastros")
    .select(COLUNAS[aba] as string, { count: "exact" })
    .eq("status", aba)
    .range((pag - 1) * POR_PAGINA, pag * POR_PAGINA - 1);
  consulta = aba === "aguardando" ? consulta.order("nome") : consulta.order("criado_em", { ascending: aba === "pendente" });
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    const filtros = [`nome.ilike.%${termo}%`, `email.ilike.%${termo}%`];
    if (digitos.length >= 3) filtros.push(`cpf.like.${digitos}%`);
    if (digitos.length >= 4) filtros.push(`telefone.ilike.%${digitos.slice(-4)}%`);
    consulta = consulta.or(filtros.join(","));
  }

  const contar = (status: string, semEmail = false) => {
    let c = supabase.from("pre_cadastros").select("id", { count: "exact", head: true }).eq("status", status);
    if (semEmail) c = c.is("email_enviado_em", null);
    return c;
  };
  const [{ data, count: total }, { count: pendentes }, { count: aguardando }, naoEnviadosR] = await Promise.all([
    consulta,
    contar("pendente"),
    contar("aguardando"),
    aba === "aguardando" && emailConfigurado() ? contar("aguardando", true) : Promise.resolve({ count: 0 }),
  ]);
  const naoEnviados = naoEnviadosR.count;
  const lista = (data ?? []) as unknown as Pedido[];
  const paginas = Math.max(1, Math.ceil((total ?? 0) / POR_PAGINA));
  const linkPagina = (p: number) => `/painel/pedidos-passe?${new URLSearchParams({ aba, q, pagina: String(p) })}`;

  // Links assinados (1 hora) para ver os documentos dos pedidos pendentes.
  const caminhos = aba === "pendente" ? lista.flatMap((p) => [p.cpf_path, p.comprovante_path, p.residencia_path, p.foto_path].filter((x): x is string => !!x)) : [];
  const links: Record<string, string> = {};
  if (caminhos.length) {
    const { data: assinados } = await supabase.storage.from("documentos").createSignedUrls(caminhos, 3600);
    assinados?.forEach((a) => {
      if (a.path && a.signedUrl) links[a.path] = a.signedUrl;
    });
  }
  const fimSemestre = `${new Date().getFullYear()}-12-31`;

  return (
    <>
      <Titulo icone={UserRoundPlus} descricao="Pedidos feitos pelos alunos no site (/cadastro). Confira os documentos e aprove ou recuse. Aprovado, o aluno entra com o CPF, e a primeira senha também é o CPF.">
        Pedidos de passe
      </Titulo>

      <div className="mb-6 inline-flex rounded-xl bg-slate-100 p-1">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={a.chave === "pendente" ? "/painel/pedidos-passe" : `/painel/pedidos-passe?aba=${a.chave}`}
            className={cx(
              "rounded-lg px-4 py-1.5 text-sm font-medium",
              a.chave === aba ? "bg-white text-azul-800 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {a.rotulo}
            <CarregandoLink />
            {a.chave === "pendente" && (pendentes ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{pendentes}</span>
            )}
            {a.chave === "aguardando" && (aguardando ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-400 px-1.5 text-xs font-bold text-white">{aguardando}</span>
            )}
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/painel/pedidos-passe">
        <input type="hidden" name="aba" value={aba} />
        <Entrada name="q" defaultValue={q} placeholder="Buscar por nome, CPF, e-mail ou telefone" className="max-w-sm" />
        <Botao type="submit" variante="secundario">
          <Search /> Buscar
        </Botao>
        <span className="text-sm text-slate-500">{total ?? 0} pedido(s)</span>
      </form>

      {aba === "aguardando" ? (
        <ListaAguardando lista={lista} naoEnviados={naoEnviados ?? 0} emailPronto={emailConfigurado()} />
      ) : lista.length === 0 ? (
        <Vazio icone={UserRoundPlus}>
          {aba === "pendente" ? "Nenhum pedido esperando análise." : "Nenhum pedido nesta lista."}
        </Vazio>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-suave">
          {lista.map((p) => (
            <details key={p.id} className="group border-b border-slate-100 last:border-b-0 open:bg-slate-50/60">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{p.nome}</span>
                  <span className="block truncate text-xs text-slate-500">
                    CPF {formatarCpf(p.cpf)} · {p.instituicao?.nome ?? p.instituicao_outra} ({CIDADES[p.cidade]}) · {p.curso}
                  </span>
                </span>
                {p.origem === "planilha" && <Selo cor="azul">da planilha</Selo>}
                <span className="hidden text-xs text-slate-500 sm:block">{dataHoraBR(p.criado_em)}</span>
                {p.status === "aprovado" && <Selo cor="verde">aprovado</Selo>}
                {p.status === "recusado" && <Selo cor="vermelho">recusado</Selo>}
              </summary>

              <div className="grid gap-5 px-4 pb-5 pl-11 lg:grid-cols-[1fr_320px]">
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Dado rotulo="WhatsApp" valor={p.telefone} />
                  <Dado rotulo="E-mail" valor={p.email} />
                  <Dado rotulo="Nascimento" valor={p.data_nascimento ? dataBR(p.data_nascimento) : null} />
                  <Dado rotulo="Endereço" valor={[p.endereco, p.bairro].filter(Boolean).join(" · ") || null} />
                  <Dado rotulo="Instituição" valor={`${p.instituicao?.nome ?? `${p.instituicao_outra} (não está na lista)`} · ${CIDADES[p.cidade]}`} />
                  <Dado rotulo="Curso" valor={`${p.curso}${p.periodo ? ` · ${p.periodo}` : ""} · ${TURNOS[p.turno]}`} />
                  {(p.linha || p.dias) && <Dado rotulo="Linha e dias (planilha)" valor={[p.linha, p.dias].filter(Boolean).join(" · ")} />}
                  {p.observacao && (
                    <div className="sm:col-span-2">
                      <Dado rotulo="Observações" valor={p.observacao} />
                    </div>
                  )}
                  {p.status === "pendente" && (
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <LinkDocumento href={links[p.cpf_path]} rotulo="Documento do CPF" />
                      <LinkDocumento href={links[p.comprovante_path]} rotulo="Comprovante da instituição" />
                      {p.residencia_path && <LinkDocumento href={links[p.residencia_path]} rotulo="Comprovante de residência" />}
                      {p.foto_path && <LinkDocumento href={links[p.foto_path]} rotulo="Foto" />}
                    </div>
                  )}
                  {p.status === "recusado" && <Dado rotulo="Motivo da recusa" valor={p.motivo} />}
                  {p.status === "aprovado" && p.aluno_id && (
                    <p className="sm:col-span-2">
                      <Link href={`/painel/alunos/${p.aluno_id}`} className="font-semibold text-azul-700 hover:underline">
                        Abrir o cadastro do aluno →
                      </Link>
                    </p>
                  )}
                </dl>

                {p.status === "pendente" && (
                  <div className="flex flex-col gap-4">
                    <Formulario acao={aprovarPreCadastro} className="gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <input type="hidden" name="id" value={p.id} />
                      <Campo rotulo="Matrícula válida até" ajuda="Conforme o comprovante enviado.">
                        <Entrada name="matricula_validade" type="date" defaultValue={fimSemestre} required />
                      </Campo>
                      <Campo rotulo="E-mail do aluno" ajuda="Corrija se estiver errado ou se já for usado por outro login.">
                        <Entrada name="email" type="email" defaultValue={p.email ?? ""} required />
                      </Campo>
                      <BotaoEnviar className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 /> Aprovar e criar acesso
                      </BotaoEnviar>
                    </Formulario>
                    <Formulario acao={recusarPreCadastro} confirmar="Recusar este cadastro? Os documentos enviados serão apagados." className="gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <Entrada name="motivo" required placeholder="Motivo da recusa (ex.: comprovante ilegível)" />
                      <BotaoEnviar variante="perigo">
                        <XCircle /> Recusar
                      </BotaoEnviar>
                    </Formulario>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {pag > 1 && (
            <BotaoLink variante="secundario" href={linkPagina(pag - 1)}>
              <ArrowLeft /> Anterior
            </BotaoLink>
          )}
          <span>
            Página {pag} de {paginas}
          </span>
          {pag < paginas && (
            <BotaoLink variante="secundario" href={linkPagina(pag + 1)}>
              Próxima <ArrowRight />
            </BotaoLink>
          )}
        </div>
      )}
    </>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="text-slate-800">{valor || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function LinkDocumento({ href, rotulo }: { href?: string; rotulo: string }) {
  if (!href) return <span className="text-xs text-red-600">{rotulo}: arquivo não encontrado</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-azul-700 ring-1 ring-inset ring-azul-200 hover:bg-azul-50"
    >
      <ExternalLink className="size-3.5" /> {rotulo}
    </a>
  );
}

/** Alunos importados das planilhas que ainda não completaram o pedido pelo link. */
function ListaAguardando({ lista, naoEnviados, emailPronto }: { lista: Pedido[]; naoEnviados: number; emailPronto: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-suave">
        <div className="min-w-0 flex-1 text-sm text-slate-600">
          Estes alunos vieram das planilhas do sistema antigo. Cada um recebe um link só dele (vale 30 dias) para digitar o CPF e
          anexar os documentos. Quando completar, o pedido passa para <strong>Esperando análise</strong>.
          {!emailPronto && (
            <p className="mt-2 font-medium text-amber-700">
              O envio de e-mail ainda não está configurado. Por enquanto use “WhatsApp” (abre a conversa com a mensagem pronta) ou “Copiar mensagem”.
            </p>
          )}
        </div>
        {emailPronto && naoEnviados > 0 && (
          <AcaoRapida
            acao={enviarLinksNaoEnviados}
            campos={{}}
            rotulo={`Enviar e-mail para quem ainda não recebeu (${naoEnviados})`}
            icone={<Send />}
            variante="primario"
            confirmar={`Enviar o link por e-mail para ${Math.min(naoEnviados, loteDeEnvio())} aluno(s)${naoEnviados > loteDeEnvio() ? " (os próximos ficam para o próximo clique)" : ""}?`}
          />
        )}
      </div>

      {lista.length === 0 ? (
        <Vazio icone={UserRoundPlus}>Nenhum aluno aguardando complemento.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-suave">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Aluno</th>
                <th className="px-4 py-2.5">Faculdade / curso</th>
                <th className="px-4 py-2.5">Linha e dias</th>
                <th className="px-4 py-2.5">E-mail</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{p.nome}</p>
                    <p className="text-xs text-slate-500">{p.telefone}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">
                    {p.instituicao?.nome ?? p.instituicao_outra} ({CIDADES[p.cidade]})
                    <br />
                    {p.curso}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {p.linha}
                    {p.dias && <span className="block text-slate-400">{p.dias}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <p className="text-slate-700">{p.email}</p>
                    {p.email_erro ? (
                      <p className="text-red-600">Erro: {p.email_erro}</p>
                    ) : p.email_enviado_em ? (
                      <p className="flex items-center gap-1 text-emerald-700">
                        <MailCheck className="size-3.5" /> enviado {dataHoraBR(p.email_enviado_em)}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-slate-400">
                        <Mail className="size-3.5" /> ainda não enviado
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <CopiarLink id={p.id} jaEnviado={!!p.email_enviado_em} />
                      {emailPronto && p.email && (
                        <AcaoRapida
                          acao={enviarLinkPedido}
                          campos={{ id: p.id }}
                          rotulo={p.email_enviado_em ? "Reenviar" : "Enviar e-mail"}
                          variante="fantasma"
                          confirmar={p.email_enviado_em ? "Reenviar? O link anterior deixa de valer." : undefined}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
