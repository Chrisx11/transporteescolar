import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronRight, ExternalLink, UserRoundPlus, XCircle } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { Campo, Entrada, Selo, Titulo, Vazio, cx } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { CIDADES, TURNOS, type Cidade } from "@/lib/rotulos";
import { dataBR, dataHoraBR } from "@/lib/tempo";
import { aprovarPreCadastro, recusarPreCadastro } from "./acoes";

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
  status: "pendente" | "aprovado" | "recusado";
  motivo: string | null;
  aluno_id: string | null;
  analisado_em: string | null;
  criado_em: string;
  instituicao: { nome: string } | null;
};

const ABAS = [
  { chave: "pendente", rotulo: "Esperando análise" },
  { chave: "aprovado", rotulo: "Aprovados" },
  { chave: "recusado", rotulo: "Recusados" },
] as const;

/** Pedidos de passe: cadastros feitos pelos alunos no formulário público (/cadastro). */
export default async function PaginaPedidosPasse({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await exigirPerfil("semeduc");
  const pedida = (await searchParams).aba;
  const aba = ABAS.find((a) => a.chave === pedida)?.chave ?? "pendente";
  const supabase = await criarClienteServidor();
  const [{ data }, { count: pendentes }] = await Promise.all([
    supabase
      .from("pre_cadastros")
      .select("*, instituicao:instituicoes(nome)")
      .eq("status", aba)
      .order("criado_em", { ascending: aba === "pendente" })
      .limit(100),
    supabase.from("pre_cadastros").select("id", { count: "exact", head: true }).eq("status", "pendente"),
  ]);
  const lista = (data ?? []) as unknown as Pedido[];

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
            {a.chave === "pendente" && (pendentes ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{pendentes}</span>
            )}
          </Link>
        ))}
      </div>

      {lista.length === 0 ? (
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
