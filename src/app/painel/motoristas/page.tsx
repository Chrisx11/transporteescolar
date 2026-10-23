import type { Metadata } from "next";
import { KeyRound, Pencil, Plus, UserCog } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida, BotaoEnviar, Formulario } from "@/components/formulario";
import { BotaoLink, Campo, Cartao, Entrada, Selo, Tabela, Titulo, Vazio, LinkAcao } from "@/components/ui";
import { Validade } from "@/components/validade";
import { formatarCpf } from "@/lib/cpf";
import { alternarMotorista, novaSenhaMotorista, salvarMotorista } from "./acoes";

export const metadata: Metadata = { title: "Motoristas" };

type Motorista = {
  usuario_id: string;
  cnh_numero: string | null;
  cnh_categoria: string;
  cnh_validade: string | null;
  usuario: { nome: string; cpf: string; email: string | null; telefone: string | null; ativo: boolean };
};

export default async function PaginaMotoristas({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  await exigirPerfil("semtransp");
  const { editar } = await searchParams;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("motoristas")
    .select("usuario_id, cnh_numero, cnh_categoria, cnh_validade, usuario:usuarios(nome, cpf, email, telefone, ativo)");
  const lista = ((data ?? []) as unknown as Motorista[]).sort((a, b) =>
    a.usuario.nome.localeCompare(b.usuario.nome, "pt-BR"),
  );
  const atual = lista.find((m) => m.usuario_id === editar);

  return (
    <>
      <Titulo icone={UserCog} descricao="O motorista entra no app com o CPF e a senha provisória.">Motoristas</Titulo>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {lista.length === 0 ? (
          <Vazio icone={UserCog}>Nenhum motorista cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>Telefone</th>
                <th>CNH</th>
                <th>Acesso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.usuario_id}>
                  <td className="font-medium">{m.usuario.nome}</td>
                  <td className="whitespace-nowrap">{formatarCpf(m.usuario.cpf)}</td>
                  <td>{m.usuario.telefone}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">Cat. {m.cnh_categoria}</span>
                      <Validade data={m.cnh_validade} />
                    </div>
                  </td>
                  <td>{m.usuario.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="vermelho">Bloqueado</Selo>}</td>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <LinkAcao icone={Pencil} href={`/painel/motoristas?editar=${m.usuario_id}`}>Editar</LinkAcao>
                      <AcaoRapida
                        acao={novaSenhaMotorista}
                        campos={{ id: m.usuario_id }}
                        rotulo="Nova senha"
 icone={<KeyRound />}
                        variante="secundario"
                        confirmar="Gerar uma nova senha provisória?"
                      />
                      <AcaoRapida
                        acao={alternarMotorista}
                        campos={{ id: m.usuario_id, ativo: String(!m.usuario.ativo) }}
                        rotulo={m.usuario.ativo ? "Bloquear" : "Liberar"}
                        variante={m.usuario.ativo ? "perigo" : "secundario"}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}

        <Cartao
          icone={atual ? Pencil : Plus}
          titulo={atual ? "Editar motorista" : "Novo motorista"}
          acoes={
            atual && (
              <BotaoLink variante="link" href="/painel/motoristas">
                Cancelar
              </BotaoLink>
            )
          }
        >
          <Formulario key={atual?.usuario_id ?? "novo"} acao={salvarMotorista} limpar={!atual}>
            {atual && <input type="hidden" name="id" value={atual.usuario_id} />}
            <Campo rotulo="Nome completo">
              <Entrada name="nome" defaultValue={atual?.usuario.nome} required />
            </Campo>
            <Campo rotulo="CPF">
              <Entrada
                name="cpf"
                inputMode="numeric"
                defaultValue={atual ? formatarCpf(atual.usuario.cpf) : ""}
                disabled={!!atual}
                required
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Telefone">
                <Entrada name="telefone" type="tel" defaultValue={atual?.usuario.telefone ?? ""} />
              </Campo>
              <Campo rotulo="E-mail (opcional)">
                <Entrada name="email" type="email" defaultValue={atual?.usuario.email ?? ""} />
              </Campo>
              <Campo rotulo="Nº da CNH">
                <Entrada name="cnh_numero" defaultValue={atual?.cnh_numero ?? ""} />
              </Campo>
              <Campo rotulo="Categoria">
                <Entrada name="cnh_categoria" defaultValue={atual?.cnh_categoria ?? "D"} maxLength={3} />
              </Campo>
            </div>
            <Campo rotulo="CNH válida até">
              <Entrada name="cnh_validade" type="date" defaultValue={atual?.cnh_validade ?? ""} />
            </Campo>
            <BotaoEnviar>{atual ? "Salvar alterações" : "Cadastrar motorista"}</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  );
}
