export type Perfil = "aluno" | "motorista" | "semeduc" | "semtransp" | "admin";
export type Cidade = "italva" | "campos" | "itaperuna";
export type Sentido = "ida" | "volta" | "deslocamento_vazio";

export const PERFIS: Record<Perfil, string> = {
  aluno: "Aluno",
  motorista: "Motorista",
  semeduc: "SEMEDUC",
  semtransp: "SEMTRANSP",
  admin: "Administrador",
};

export const CIDADES: Record<Cidade, string> = {
  italva: "Italva",
  campos: "Campos dos Goytacazes",
  itaperuna: "Itaperuna",
};

/** Nome curto (cartões e celular). */
export const CIDADES_CURTO: Record<Cidade, string> = { italva: "Italva", campos: "Campos", itaperuna: "Itaperuna" };

export const SENTIDOS: Record<Sentido, string> = {
  ida: "Ida",
  volta: "Volta",
  deslocamento_vazio: "Deslocamento vazio",
};

export const SITUACOES_ALUNO = { pendente: "Pendente", ativo: "Ativo", inativo: "Inativo" } as const;
export const SITUACOES_ONIBUS = { ativo: "Ativo", manutencao: "Em manutenção" } as const;
export const TIPOS_CALENDARIO = { feriado: "Feriado", recesso: "Recesso", sem_aula: "Sem aula" } as const;
export const TURNOS = { manha: "Manhã", tarde: "Tarde", noite: "Noite", integral: "Integral" } as const;
export const PRAZO_TIPOS = { dia_anterior: "Dia anterior", mesmo_dia: "Mesmo dia" } as const;

/** Perfis que usam o painel de computador. */
export const PERFIS_PAINEL: Perfil[] = ["semeduc", "semtransp", "admin"];

/** Página inicial de cada perfil. */
export function inicioDoPerfil(perfil: Perfil): string {
  if (perfil === "aluno") return "/app";
  if (perfil === "motorista") return "/app/motorista";
  return "/painel";
}

/** Páginas de login, uma por perfil: /login/<perfil>. */
export const AREAS_LOGIN: Record<Perfil, { titulo: string; descricao: string; icone: string }> = {
  aluno: { titulo: "Aluno", descricao: "Reservar viagens e confirmar embarque", icone: "🎓" },
  motorista: { titulo: "Motorista", descricao: "Listas de embarque das viagens", icone: "🚌" },
  semeduc: { titulo: "SEMEDUC", descricao: "Secretaria de Educação", icone: "📚" },
  semtransp: { titulo: "SEMTRANSP", descricao: "Secretaria de Transportes", icone: "🛣️" },
  admin: { titulo: "Administração", descricao: "Usuários e parâmetros do sistema", icone: "⚙️" },
};

export function ehPerfil(v: string): v is Perfil {
  return v in AREAS_LOGIN;
}

/** E-mail interno para quem não tem e-mail (só para o Supabase Auth). */
export function emailInterno(cpf: string): string {
  return `${cpf}@login.italva.invalid`;
}
export function ehEmailInterno(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@login.italva.invalid");
}
