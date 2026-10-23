import { Campo, Entrada } from "@/components/ui";

export type DadosAluno = {
  nome?: string;
  cpf?: string;
  data_nascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  bairro?: string | null;
};

/** Campos de dados pessoais do aluno (cadastro e edição). */
export function CamposDadosAluno({ dados, cpfFixo }: { dados?: DadosAluno; cpfFixo?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="Nome completo" className="sm:col-span-2">
        <Entrada name="nome" defaultValue={dados?.nome} required />
      </Campo>
      <Campo rotulo="CPF">
        <Entrada name="cpf" inputMode="numeric" defaultValue={dados?.cpf} disabled={cpfFixo} required={!cpfFixo} />
      </Campo>
      <Campo rotulo="Data de nascimento">
        <Entrada name="data_nascimento" type="date" defaultValue={dados?.data_nascimento ?? ""} />
      </Campo>
      <Campo rotulo="WhatsApp" ajuda="Com DDD. É o canal principal de avisos.">
        <Entrada name="telefone" type="tel" defaultValue={dados?.telefone ?? ""} placeholder="(22) 99999-9999" />
      </Campo>
      <Campo rotulo="E-mail (opcional)" ajuda="Usado para recuperar a senha.">
        <Entrada name="email" type="email" defaultValue={dados?.email ?? ""} />
      </Campo>
      <Campo rotulo="Endereço">
        <Entrada name="endereco" defaultValue={dados?.endereco ?? ""} />
      </Campo>
      <Campo rotulo="Bairro">
        <Entrada name="bairro" defaultValue={dados?.bairro ?? ""} />
      </Campo>
    </div>
  );
}
