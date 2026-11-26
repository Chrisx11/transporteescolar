-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
-- Pré-cadastro do aluno (formulário público /cadastro + análise da SEMEDUC)
-- e comprovante de residência.

-- =====================================================================
-- Pré-cadastro do aluno (seção 7.1): quem ainda não tem acesso preenche um
-- formulário público com os dados e os documentos (CPF e comprovante da
-- instituição). A SEMEDUC confere e aprova (cria o aluno) ou recusa.
-- Os arquivos ficam no bucket privado "documentos", em pre-cadastro/<id>/.
-- O formulário grava pelo servidor (chave de serviço); ninguém de fora lê.
-- =====================================================================

do $$ begin
  create type public.status_pre_cadastro as enum ('pendente', 'aprovado', 'recusado');
exception when duplicate_object then null; end $$;

create table if not exists public.pre_cadastros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf char(11) not null check (cpf ~ '^\d{11}$'),
  data_nascimento date,
  telefone text not null,
  email text,
  endereco text,
  bairro text,
  cidade public.cidade not null check (cidade in ('campos', 'itaperuna')),
  instituicao_id uuid references public.instituicoes (id) on delete set null,
  instituicao_outra text,
  curso text not null,
  periodo text,
  turno public.turno not null,
  cpf_path text not null,
  comprovante_path text not null,
  foto_path text,
  status public.status_pre_cadastro not null default 'pendente',
  motivo text,
  aluno_id uuid references public.usuarios (id) on delete set null,
  analisado_por uuid references public.usuarios (id) on delete set null,
  analisado_em timestamptz,
  ip text,
  criado_em timestamptz not null default now(),
  check (instituicao_id is not null or coalesce(trim(instituicao_outra), '') <> '')
);
create index if not exists pre_cadastros_status_idx on public.pre_cadastros (status, criado_em);
-- Um pedido pendente por CPF.
create unique index if not exists pre_cadastros_cpf_pendente_idx on public.pre_cadastros (cpf) where status = 'pendente';

alter table public.pre_cadastros enable row level security;
drop policy if exists pre_cadastros_ler on public.pre_cadastros;
create policy pre_cadastros_ler on public.pre_cadastros for select using (public.eh_perfil('semeduc', 'admin'));
drop policy if exists pre_cadastros_alterar on public.pre_cadastros;
create policy pre_cadastros_alterar on public.pre_cadastros for update
  using (public.eh_perfil('semeduc', 'admin')) with check (public.eh_perfil('semeduc', 'admin'));

drop trigger if exists pre_cadastros_auditoria on public.pre_cadastros;
create trigger pre_cadastros_auditoria after insert or update or delete on public.pre_cadastros
  for each row execute function public.registrar_auditoria();

-- Comprovante de residência no pré-cadastro e no cadastro do aluno.
alter table public.pre_cadastros add column if not exists residencia_path text;
alter table public.alunos add column if not exists residencia_path text;
comment on column public.alunos.residencia_path is 'Comprovante de residência (bucket documentos, pasta <aluno_id>/).';

notify pgrst, 'reload schema';
