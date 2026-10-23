import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, GraduationCap } from "lucide-react";
import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoLink, Entrada, Selecao, Selo, Tabela, Titulo, Vazio, Botao } from "@/components/ui";
import { Validade } from "@/components/validade";
import { formatarCpf, limparCpf } from "@/lib/cpf";
import { SITUACOES_ALUNO } from "@/lib/rotulos";

export const metadata: Metadata = { title: "Alunos" };

const POR_PAGINA = 50;

type Linha = {
  usuario_id: string;
  situacao: keyof typeof SITUACOES_ALUNO;
  matricula_validade: string | null;
  usuario: { nome: string; cpf: string; telefone: string | null };
  aluno_vinculos: { curso: string; instituicao: { nome: string } | null }[];
};

const COR_SITUACAO = { ativo: "verde", pendente: "amarelo", inativo: "cinza" } as const;

export default async function PaginaAlunos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string; pagina?: string }>;
}) {
  await exigirPerfil("semeduc");
  const { q = "", situacao = "", pagina = "1" } = await searchParams;
  const pag = Math.max(1, Number(pagina) || 1);
  const supabase = await criarClienteServidor();

  let consulta = supabase
    .from("alunos")
    .select(
      "usuario_id, situacao, matricula_validade, usuario:usuarios!inner(nome, cpf, telefone), aluno_vinculos(curso, instituicao:instituicoes(nome))",
      { count: "exact" },
    )
    .order("usuario(nome)")
    .range((pag - 1) * POR_PAGINA, pag * POR_PAGINA - 1);

  if (situacao) consulta = consulta.eq("situacao", situacao);
  const termo = q.trim();
  if (termo) {
    const digitos = limparCpf(termo);
    consulta =
      digitos.length >= 3 && digitos.length === termo.replace(/[.\-\s]/g, "").length
        ? consulta.like("usuario.cpf", `${digitos}%`)
        : consulta.ilike("usuario.nome", `%${termo.replace(/[%_]/g, "")}%`);
  }

  const { data, count } = await consulta;
  const lista = (data ?? []) as unknown as Linha[];
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) => `/painel/alunos?${new URLSearchParams({ q, situacao, pagina: String(p) })}`;

  return (
    <>
      <Titulo icone={GraduationCap} descricao={`${total} aluno(s) encontrado(s)`} acoes={<BotaoLink href="/painel/alunos/novo">Novo aluno</BotaoLink>}>
        Alunos
      </Titulo>

      <form className="mb-4 flex flex-wrap gap-2" action="/painel/alunos">
        <Entrada name="q" defaultValue={q} placeholder="Buscar por nome ou CPF" className="max-w-sm" />
        <Selecao name="situacao" defaultValue={situacao} className="w-44">
          <option value="">Todas as situações</option>
          {Object.entries(SITUACOES_ALUNO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
        <Botao type="submit" variante="secundario">
          Buscar
        </Botao>
      </form>

      {lista.length === 0 ? (
        <Vazio icone={GraduationCap}>Nenhum aluno encontrado.</Vazio>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Instituição / curso</th>
              <th>Matrícula</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.usuario_id}>
                <td>
                  <Link href={`/painel/alunos/${a.usuario_id}`} className="font-medium text-azul-700 hover:underline">
                    {a.usuario.nome}
                  </Link>
                  {a.usuario.telefone && <p className="text-xs text-slate-500">{a.usuario.telefone}</p>}
                </td>
                <td className="whitespace-nowrap">{formatarCpf(a.usuario.cpf)}</td>
                <td className="text-xs">
                  {a.aluno_vinculos.map((v, i) => (
                    <p key={i}>
                      {v.instituicao?.nome} · {v.curso}
                    </p>
                  ))}
                </td>
                <td>
                  <Validade data={a.matricula_validade} diasAviso={15} />
                </td>
                <td>
                  <Selo cor={COR_SITUACAO[a.situacao]}>{SITUACOES_ALUNO[a.situacao]}</Selo>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {pag > 1 && (
            <BotaoLink variante="secundario" href={link(pag - 1)}>
              <ArrowLeft /> Anterior
            </BotaoLink>
          )}
          <span>
            Página {pag} de {paginas}
          </span>
          {pag < paginas && (
            <BotaoLink variante="secundario" href={link(pag + 1)}>
              Próxima <ArrowRight />
            </BotaoLink>
          )}
        </div>
      )}
    </>
  );
}
