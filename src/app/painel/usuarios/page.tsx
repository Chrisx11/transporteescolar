import type { Metadata } from "next";
import { KeyRound, Pencil, Plus, UsersRound } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo, LinkAcao } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { PERFIS, type Perfil } from "@/lib/rotulos";
import { alternarEquipe, novaSenhaEquipe, salvarUsuarioEquipe } from "./acoes";

export const metadata: Metadata = { title: "Usuários e senhas" };

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "semeduc", rotulo: "SEMEDUC" },
  { valor: "semtransp", rotulo: "SEMTRANSP" },
  { valor: "motorista", rotulo: "Motoristas" },
  { valor: "admin", rotulo: "Administradores" },
];
const COR_PERFIL = { semeduc: "verde", semtransp: "azul", motorista: "amarelo", admin: "cinza", aluno: "cinza" } as const;

type Usuario = { id: string; nome: string; cpf: string; email: string | null; telefone: string | null; perfil: Perfil; ativo: boolean };

export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<{ editar?: string; perfil?: string }> }) {
  const sessao = await exigirPerfil("admin");
  const { editar, perfil } = await searchParams;
  const filtro = FILTROS.some((x) => x.valor === perfil) ? (perfil ?? "") : "";
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("usuarios")
    .select("id, nome, cpf, email, telefone, perfil, ativo")
    .in("perfil", ["semeduc", "semtransp", "motorista", "admin"])
    .order("nome");
  if (filtro) consulta = consulta.eq("perfil", filtro);
  const { data } = await consulta;
  const lista = (data ?? []) as Usuario[];
  const atual = lista.find((u) => u.id === editar);

  return (
    <>
      <Titulo icone={UsersRound} descricao="Crie o login (CPF e senha provisória) da SEMEDUC, da SEMTRANSP e dos motoristas. Os alunos são cadastrados pela Educação.">
        Usuários e senhas
      </Titulo>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((x) => (
          <a
            key={x.valor}
            href={x.valor ? `/painel/usuarios?perfil=${x.valor}` : "/painel/usuarios"}
            className={
              "rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors " +
              (filtro === x.valor ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")
            }
          >
            {x.rotulo}
          </a>
        ))}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <Tabela>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Perfil</th>
              <th>Acesso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="font-medium">{u.nome}</span>
                  {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                </td>
                <td className="whitespace-nowrap">{formatarCpf(u.cpf)}</td>
                <td>
                  <Selo cor={COR_PERFIL[u.perfil]}>{PERFIS[u.perfil]}</Selo>
                </td>
                <td>{u.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="vermelho">Bloqueado</Selo>}</td>
                <td>
                  <div className="flex flex-wrap items-start gap-2">
                    <LinkAcao icone={Pencil} href={`/painel/usuarios?editar=${u.id}`}>Editar</LinkAcao>
                    <AcaoRapida
                      acao={novaSenhaEquipe}
                      campos={{ id: u.id }}
                      rotulo="Nova senha"
 icone={<KeyRound />}
                      variante="secundario"
                      confirmar="Gerar uma nova senha provisória?"
                    />
                    {u.id !== sessao.id && (
                      <AcaoRapida
                        acao={alternarEquipe}
                        campos={{ id: u.id, ativo: String(!u.ativo) }}
                        rotulo={u.ativo ? "Bloquear" : "Liberar"}
                        variante={u.ativo ? "perigo" : "secundario"}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>

        <Cartao
          icone={atual ? Pencil : Plus}
          titulo={atual ? "Editar usuário" : "Novo usuário"}
          acoes={
            atual && (
              <BotaoLink variante="link" href="/painel/usuarios">
                Cancelar
              </BotaoLink>
            )
          }
        >
          <Formulario key={atual?.id ?? "novo"} acao={salvarUsuarioEquipe} limpar={!atual}>
            {atual && <input type="hidden" name="id" value={atual.id} />}
            <Campo rotulo="Nome completo">
              <Entrada name="nome" defaultValue={atual?.nome} required />
            </Campo>
            <Campo rotulo="CPF">
              <Entrada name="cpf" inputMode="numeric" defaultValue={atual ? formatarCpf(atual.cpf) : ""} disabled={!!atual} required />
            </Campo>
            <Campo rotulo="Perfil">
              <Selecao name="perfil" defaultValue={atual?.perfil ?? (filtro || "semeduc")} disabled={!!atual}>
                <option value="semeduc">SEMEDUC (Educação)</option>
                <option value="semtransp">SEMTRANSP (Transportes)</option>
                <option value="motorista">Motorista</option>
                <option value="admin">Administrador</option>
              </Selecao>
            </Campo>
            <Campo rotulo="E-mail (opcional)" ajuda="Com e-mail, a pessoa recupera a senha sozinha em Esqueci minha senha.">
              <Entrada name="email" type="email" defaultValue={atual?.email ?? ""} />
            </Campo>
            <Campo rotulo="Telefone">
              <Entrada name="telefone" type="tel" defaultValue={atual?.telefone ?? ""} />
            </Campo>
            <BotaoEnviar>{atual ? "Salvar alterações" : "Criar usuário"}</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
