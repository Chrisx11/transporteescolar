import type { Metadata } from "next";
import { KeyRound, Pencil, Plus, UsersRound } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo, LinkAcao } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { PERFIS, type Perfil } from "@/lib/rotulos";
import { alternarEquipe, novaSenhaEquipe, salvarUsuarioEquipe } from "./acoes";

export const metadata: Metadata = { title: "Usuários das secretarias" };

type Usuario = { id: string; nome: string; cpf: string; email: string | null; telefone: string | null; perfil: Perfil; ativo: boolean };

export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const sessao = await exigirPerfil("admin");
  const { editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("usuarios")
    .select("id, nome, cpf, email, telefone, perfil, ativo")
    .in("perfil", ["semeduc", "semtransp", "admin"])
    .order("nome");
  const lista = (data ?? []) as Usuario[];
  const atual = lista.find((u) => u.id === editar);

  return (
    <>
      <Titulo icone={UsersRound} descricao="Contas da SEMEDUC, SEMTRANSP e administradores. Alunos e motoristas são cadastrados pelas secretarias.">
        Usuários das secretarias
      </Titulo>
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
                  <Selo cor="azul">{PERFIS[u.perfil]}</Selo>
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
              <Selecao name="perfil" defaultValue={atual?.perfil ?? "semeduc"} disabled={!!atual}>
                <option value="semeduc">SEMEDUC</option>
                <option value="semtransp">SEMTRANSP</option>
                <option value="admin">Administrador</option>
              </Selecao>
            </Campo>
            <Campo rotulo="E-mail" ajuda="Recomendado: permite recuperar a senha sozinho.">
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
