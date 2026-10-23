-- Fase 1 completa: cole TUDO no SQL Editor do Supabase e clique em Run (rodar uma única vez).
-- Gerado a partir de supabase/migrations/. Não edite aqui.
begin;

-- >>> supabase/migrations/20261023000100_base.sql
-- =====================================================================
-- Fase 1 — Base e cadastros
-- Tabelas, enums e funções auxiliares.
-- Todo cálculo de prazo usa America/Sao_Paulo explicitamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.perfil as enum ('aluno', 'motorista', 'semeduc', 'semtransp', 'admin');
create type public.cidade as enum ('italva', 'campos', 'itaperuna');
create type public.sentido as enum ('ida', 'volta', 'deslocamento_vazio');
create type public.prazo_tipo as enum ('dia_anterior', 'mesmo_dia');
create type public.situacao_aluno as enum ('pendente', 'ativo', 'inativo');
create type public.situacao_onibus as enum ('ativo', 'manutencao');
create type public.tipo_calendario as enum ('feriado', 'recesso', 'sem_aula');
create type public.turno as enum ('manha', 'tarde', 'noite', 'integral');
create type public.tipo_parametro as enum ('numero', 'texto', 'hora', 'booleano');

-- ---------------------------------------------------------------------
-- Funções utilitárias (sem dependência de tabelas)
-- ---------------------------------------------------------------------

-- Valida CPF (11 dígitos + dígitos verificadores; rejeita sequências repetidas).
create or replace function public.cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  d int[];
  soma int;
  dv1 int;
  dv2 int;
begin
  if p_cpf is null or p_cpf !~ '^\d{11}$' then
    return false;
  end if;
  if p_cpf ~ '^(\d)\1{10}$' then
    return false;
  end if;
  d := array(select substr(p_cpf, i, 1)::int from generate_series(1, 11) i);

  soma := 0;
  for i in 1..9 loop soma := soma + d[i] * (11 - i); end loop;
  dv1 := (soma * 10) % 11;
  if dv1 = 10 then dv1 := 0; end if;

  soma := 0;
  for i in 1..10 loop soma := soma + d[i] * (12 - i); end loop;
  dv2 := (soma * 10) % 11;
  if dv2 = 10 then dv2 := 0; end if;

  return d[10] = dv1 and d[11] = dv2;
end;
$$;

-- Prazo de reserva/cancelamento de uma viagem numa data (RN03/RN04).
-- Retorna o instante absoluto calculado no fuso de São Paulo.
create or replace function public.calcular_prazo(p_data date, p_tipo public.prazo_tipo, p_hora time)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_tipo is null or p_hora is null then null
    when p_tipo = 'dia_anterior' then ((p_data - 1) + p_hora) at time zone 'America/Sao_Paulo'
    else (p_data + p_hora) at time zone 'America/Sao_Paulo'
  end;
$$;

-- Data/hora "agora" em São Paulo (para comparações de data local).
create or replace function public.hoje_sp()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Usuários e perfis
-- ---------------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  cpf char(11) not null unique check (public.cpf_valido(cpf)),
  nome text not null check (length(trim(nome)) > 0),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone text,
  perfil public.perfil not null,
  ativo boolean not null default true,
  troca_senha_obrigatoria boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column public.usuarios.email is 'E-mail de contato e de recuperação de senha. Nulo = usa e-mail interno no Auth.';
create index usuarios_perfil_idx on public.usuarios (perfil);
create trigger usuarios_atualizado_em before update on public.usuarios
  for each row execute function public.tocar_atualizado_em();

create table public.aceites_termo (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  versao text not null,
  aceito_em timestamptz not null default now(),
  unique (usuario_id, versao)
);

-- Tentativas de login (limite contra força bruta). Só acessada pelo servidor.
create table public.tentativas_login (
  id bigint generated always as identity primary key,
  cpf char(11) not null,
  ip text,
  sucesso boolean not null,
  criado_em timestamptz not null default now()
);
create index tentativas_login_cpf_idx on public.tentativas_login (cpf, criado_em desc);

-- Funções de perfil usadas nas políticas RLS.
create or replace function public.meu_perfil()
returns public.perfil
language sql
stable
security definer
set search_path = public
as $$
  select perfil from public.usuarios where id = auth.uid() and ativo;
$$;

create or replace function public.eh_perfil(variadic p_perfis public.perfil[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.meu_perfil() = any (p_perfis), false);
$$;

-- O próprio usuário marca que já trocou a senha provisória.
create or replace function public.marcar_senha_trocada()
returns void
language sql
security definer
set search_path = public
as $$
  update public.usuarios set troca_senha_obrigatoria = false where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Parâmetros do sistema
-- ---------------------------------------------------------------------
create table public.parametros (
  chave text primary key,
  valor jsonb not null,
  tipo public.tipo_parametro not null,
  rotulo text not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);
create trigger parametros_atualizado_em before update on public.parametros
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Instituições e calendário
-- ---------------------------------------------------------------------
create table public.instituicoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade public.cidade not null check (cidade <> 'italva'),
  endereco text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (nome, cidade)
);

create table public.semestres (
  id uuid primary key default gen_random_uuid(),
  instituicao_id uuid not null references public.instituicoes (id) on delete cascade,
  nome text not null,
  inicio date not null,
  fim date not null,
  check (fim >= inicio)
);
create index semestres_instituicao_idx on public.semestres (instituicao_id, inicio);

create table public.calendario (
  id uuid primary key default gen_random_uuid(),
  instituicao_id uuid references public.instituicoes (id) on delete cascade,
  data date not null,
  tipo public.tipo_calendario not null,
  descricao text not null,
  unique nulls not distinct (instituicao_id, data)
);
comment on column public.calendario.instituicao_id is 'Nulo = vale para todos (feriado/recesso geral).';
create index calendario_data_idx on public.calendario (data);

-- ---------------------------------------------------------------------
-- Pontos de embarque
-- ---------------------------------------------------------------------
create table public.pontos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade public.cidade not null,
  endereco text,
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (nome, cidade)
);
create index pontos_cidade_ordem_idx on public.pontos (cidade, ordem);

-- ---------------------------------------------------------------------
-- Frota e motoristas
-- ---------------------------------------------------------------------
create table public.onibus (
  id uuid primary key default gen_random_uuid(),
  prefixo text not null unique,
  placa text not null unique,
  capacidade int not null check (capacidade > 0),
  situacao public.situacao_onibus not null default 'ativo',
  qr_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  vistoria_validade date,
  licenciamento_validade date,
  criado_em timestamptz not null default now()
);

create table public.motoristas (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  cnh_numero text,
  cnh_categoria text not null default 'D',
  cnh_validade date
);

-- ---------------------------------------------------------------------
-- Viagens modelo (grade geral) e escala modelo
-- ---------------------------------------------------------------------
create table public.viagens_modelo (
  id uuid primary key default gen_random_uuid(),
  cidade public.cidade not null check (cidade <> 'italva'),
  nome text not null,
  sentido public.sentido not null,
  hora_saida time not null,
  duracao_min int not null default 75 check (duracao_min > 0),
  prazo_tipo public.prazo_tipo,
  prazo_hora time,
  dias_semana smallint[] not null default '{1,2,3,4,5,6}',
  condicional boolean not null default false,
  bloqueia_ao_lotar boolean not null default false,
  km_estimado numeric(7, 1) check (km_estimado is null or km_estimado >= 0),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cidade, nome),
  -- Reservável e não condicional precisa de prazo.
  check (
    sentido = 'deslocamento_vazio' or condicional
    or (prazo_tipo is not null and prazo_hora is not null)
  ),
  check (dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(dias_semana) > 0),
  -- Idas nunca bloqueiam por lotação (RN05).
  check (not (sentido = 'ida' and bloqueia_ao_lotar))
);
comment on column public.viagens_modelo.duracao_min is 'Duração estimada do trecho, usada para detectar conflito de escala (RN11).';
comment on column public.viagens_modelo.dias_semana is 'ISO: 1 = segunda ... 7 = domingo.';

create table public.escala_modelo (
  id uuid primary key default gen_random_uuid(),
  viagem_modelo_id uuid not null references public.viagens_modelo (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  onibus_id uuid not null references public.onibus (id) on delete restrict,
  motorista_id uuid references public.motoristas (usuario_id) on delete set null,
  unique (viagem_modelo_id, dia_semana, onibus_id)
);
create index escala_modelo_dia_idx on public.escala_modelo (dia_semana);

-- RN11: impede o mesmo ônibus/motorista em dois trechos que se sobrepõem no mesmo dia.
create or replace function public.validar_escala_modelo()
returns trigger
language plpgsql
as $$
declare
  v_modelo public.viagens_modelo;
  v_conflito record;
begin
  select * into v_modelo from public.viagens_modelo where id = new.viagem_modelo_id;

  if not (new.dia_semana = any (v_modelo.dias_semana)) then
    raise exception 'A viagem "%" não opera neste dia da semana.', v_modelo.nome
      using errcode = 'P0001';
  end if;

  select vm.nome, vm.cidade, vm.hora_saida,
         (e.onibus_id = new.onibus_id) as mesmo_onibus
    into v_conflito
    from public.escala_modelo e
    join public.viagens_modelo vm on vm.id = e.viagem_modelo_id
   where e.dia_semana = new.dia_semana
     and e.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and e.viagem_modelo_id <> new.viagem_modelo_id
     and (e.onibus_id = new.onibus_id
          or (new.motorista_id is not null and e.motorista_id = new.motorista_id))
     and vm.hora_saida < v_modelo.hora_saida + make_interval(mins => v_modelo.duracao_min)
     and v_modelo.hora_saida < vm.hora_saida + make_interval(mins => vm.duracao_min)
   limit 1;

  if found then
    raise exception 'Conflito de horário: % já está em "%" (%) às %.',
      case when v_conflito.mesmo_onibus then 'este ônibus' else 'este motorista' end,
      v_conflito.nome, v_conflito.cidade, to_char(v_conflito.hora_saida, 'HH24:MI')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger escala_modelo_validar before insert or update on public.escala_modelo
  for each row execute function public.validar_escala_modelo();

-- ---------------------------------------------------------------------
-- Alunos
-- ---------------------------------------------------------------------
create table public.alunos (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  data_nascimento date,
  foto_path text,
  endereco text,
  bairro text,
  situacao public.situacao_aluno not null default 'pendente',
  motivo_devolucao text,
  matricula_validade date,
  comprovante_path text,
  ponto_ida_padrao_id uuid references public.pontos (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index alunos_situacao_idx on public.alunos (situacao);
create trigger alunos_atualizado_em before update on public.alunos
  for each row execute function public.tocar_atualizado_em();

create table public.aluno_vinculos (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  instituicao_id uuid not null references public.instituicoes (id) on delete restrict,
  curso text not null,
  periodo text,
  turno public.turno not null,
  unique (aluno_id, instituicao_id, curso)
);
create index aluno_vinculos_instituicao_idx on public.aluno_vinculos (instituicao_id);

create table public.aluno_pontos_volta (
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  cidade public.cidade not null check (cidade <> 'italva'),
  ponto_id uuid not null references public.pontos (id) on delete cascade,
  primary key (aluno_id, cidade)
);

create table public.grade_semanal (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  viagem_ida_modelo_id uuid references public.viagens_modelo (id) on delete set null,
  viagem_volta_modelo_id uuid references public.viagens_modelo (id) on delete set null,
  ponto_ida_id uuid references public.pontos (id) on delete set null,
  ponto_volta_id uuid references public.pontos (id) on delete set null,
  instituicao_id uuid references public.instituicoes (id) on delete set null,
  unique (aluno_id, dia_semana)
);

-- Garante que a ida é uma ida, a volta é uma volta e ambas operam naquele dia.
create or replace function public.validar_grade_semanal()
returns trigger
language plpgsql
as $$
declare
  v public.viagens_modelo;
begin
  if new.viagem_ida_modelo_id is not null then
    select * into v from public.viagens_modelo where id = new.viagem_ida_modelo_id;
    if v.sentido <> 'ida' then
      raise exception '"%" não é uma viagem de ida.', v.nome using errcode = 'P0001';
    end if;
    if not (new.dia_semana = any (v.dias_semana)) then
      raise exception 'A viagem "%" não opera neste dia da semana.', v.nome using errcode = 'P0001';
    end if;
  end if;

  if new.viagem_volta_modelo_id is not null then
    select * into v from public.viagens_modelo where id = new.viagem_volta_modelo_id;
    if v.sentido <> 'volta' then
      raise exception '"%" não é uma viagem de volta.', v.nome using errcode = 'P0001';
    end if;
    if not (new.dia_semana = any (v.dias_semana)) then
      raise exception 'A viagem "%" não opera neste dia da semana.', v.nome using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger grade_semanal_validar before insert or update on public.grade_semanal
  for each row execute function public.validar_grade_semanal();

create table public.anotacoes_aluno (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  texto text not null,
  autor_id uuid references public.usuarios (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now()
);
create index anotacoes_aluno_idx on public.anotacoes_aluno (aluno_id, criado_em desc);

-- >>> supabase/migrations/20261023000200_rls_auditoria.sql
-- =====================================================================
-- Fase 1 — Row Level Security, auditoria e Storage
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid,
  tabela text not null,
  registro_id text,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index auditoria_tabela_idx on public.auditoria (tabela, registro_id);
create index auditoria_criado_idx on public.auditoria (criado_em desc);

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_reg jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_antes := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_depois := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_antes = v_depois then
    return new;
  end if;
  v_reg := coalesce(v_depois, v_antes);

  insert into public.auditoria (usuario_id, tabela, registro_id, acao, antes, depois)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(v_reg ->> 'id', v_reg ->> 'usuario_id', v_reg ->> 'chave',
             concat_ws(':', v_reg ->> 'aluno_id', v_reg ->> 'cidade')),
    tg_op,
    v_antes,
    v_depois
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'usuarios', 'parametros', 'instituicoes', 'semestres', 'calendario', 'pontos',
    'onibus', 'motoristas', 'viagens_modelo', 'escala_modelo', 'alunos',
    'aluno_vinculos', 'aluno_pontos_volta', 'grade_semanal', 'anotacoes_aluno'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()',
      t || '_auditoria', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: liga em todas as tabelas
-- ---------------------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.aceites_termo enable row level security;
alter table public.tentativas_login enable row level security;
alter table public.parametros enable row level security;
alter table public.instituicoes enable row level security;
alter table public.semestres enable row level security;
alter table public.calendario enable row level security;
alter table public.pontos enable row level security;
alter table public.onibus enable row level security;
alter table public.motoristas enable row level security;
alter table public.viagens_modelo enable row level security;
alter table public.escala_modelo enable row level security;
alter table public.alunos enable row level security;
alter table public.aluno_vinculos enable row level security;
alter table public.aluno_pontos_volta enable row level security;
alter table public.grade_semanal enable row level security;
alter table public.anotacoes_aluno enable row level security;
alter table public.auditoria enable row level security;
-- tentativas_login: sem políticas = só a chave de serviço (servidor) acessa.

-- usuarios ------------------------------------------------------------
create policy usuarios_ler_proprio on public.usuarios for select
  using (id = auth.uid());
create policy usuarios_ler_equipe on public.usuarios for select
  using (public.eh_perfil('semeduc', 'semtransp', 'admin'));

create policy usuarios_inserir on public.usuarios for insert
  with check (
    public.eh_perfil('admin')
    or (perfil = 'aluno' and public.eh_perfil('semeduc'))
    or (perfil = 'motorista' and public.eh_perfil('semtransp'))
  );
create policy usuarios_alterar on public.usuarios for update
  using (
    public.eh_perfil('admin')
    or (perfil = 'aluno' and public.eh_perfil('semeduc'))
    or (perfil = 'motorista' and public.eh_perfil('semtransp'))
  )
  with check (
    public.eh_perfil('admin')
    or (perfil = 'aluno' and public.eh_perfil('semeduc'))
    or (perfil = 'motorista' and public.eh_perfil('semtransp'))
  );
-- Exclusão de usuários só pelo servidor (remove também o login no Auth).

-- aceites_termo -------------------------------------------------------
create policy aceites_ler on public.aceites_termo for select
  using (usuario_id = auth.uid() or public.eh_perfil('admin', 'semeduc'));
create policy aceites_inserir_proprio on public.aceites_termo for insert
  with check (usuario_id = auth.uid());

-- parametros ----------------------------------------------------------
create policy parametros_ler on public.parametros for select
  to authenticated using (true);
create policy parametros_alterar on public.parametros for update
  using (public.eh_perfil('admin')) with check (public.eh_perfil('admin'));

-- Tabelas de leitura geral para usuários logados, escrita por uma secretaria.
-- instituicoes / semestres / calendario → SEMEDUC
-- pontos / viagens_modelo             → SEMTRANSP
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('instituicoes', 'semeduc'),
      ('semestres', 'semeduc'),
      ('calendario', 'semeduc'),
      ('pontos', 'semtransp'),
      ('viagens_modelo', 'semtransp')
    ) as v(tabela, dono)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      r.tabela || '_ler', r.tabela);
    execute format(
      'create policy %I on public.%I for all
         using (public.eh_perfil(%L, ''admin''))
         with check (public.eh_perfil(%L, ''admin''))',
      r.tabela || '_escrever', r.tabela, r.dono, r.dono);
  end loop;
end;
$$;

-- onibus --------------------------------------------------------------
-- Aluno não lê a tabela de ônibus diretamente (o qr_token é sensível).
create policy onibus_ler on public.onibus for select
  using (public.eh_perfil('semtransp', 'semeduc', 'admin', 'motorista'));
create policy onibus_escrever on public.onibus for all
  using (public.eh_perfil('semtransp', 'admin'))
  with check (public.eh_perfil('semtransp', 'admin'));

-- motoristas ----------------------------------------------------------
create policy motoristas_ler on public.motoristas for select
  using (usuario_id = auth.uid() or public.eh_perfil('semtransp', 'admin'));
create policy motoristas_escrever on public.motoristas for all
  using (public.eh_perfil('semtransp', 'admin'))
  with check (public.eh_perfil('semtransp', 'admin'));

-- escala_modelo -------------------------------------------------------
create policy escala_modelo_ler on public.escala_modelo for select
  using (motorista_id = auth.uid() or public.eh_perfil('semtransp', 'admin'));
create policy escala_modelo_escrever on public.escala_modelo for all
  using (public.eh_perfil('semtransp', 'admin'))
  with check (public.eh_perfil('semtransp', 'admin'));

-- alunos e dados do aluno ---------------------------------------------
create policy alunos_ler on public.alunos for select
  using (usuario_id = auth.uid() or public.eh_perfil('semeduc', 'semtransp', 'admin'));
create policy alunos_escrever on public.alunos for all
  using (public.eh_perfil('semeduc', 'admin'))
  with check (public.eh_perfil('semeduc', 'admin'));

do $$
declare
  t text;
begin
  foreach t in array array['aluno_vinculos', 'aluno_pontos_volta', 'grade_semanal'] loop
    execute format(
      'create policy %I on public.%I for select
         using (aluno_id = auth.uid() or public.eh_perfil(''semeduc'', ''semtransp'', ''admin''))',
      t || '_ler', t);
    execute format(
      'create policy %I on public.%I for all
         using (public.eh_perfil(''semeduc'', ''admin''))
         with check (public.eh_perfil(''semeduc'', ''admin''))',
      t || '_escrever', t);
  end loop;
end;
$$;

-- Anotações são internas da secretaria (o aluno não vê).
create policy anotacoes_ler on public.anotacoes_aluno for select
  using (public.eh_perfil('semeduc', 'admin'));
create policy anotacoes_inserir on public.anotacoes_aluno for insert
  with check (public.eh_perfil('semeduc', 'admin') and autor_id = auth.uid());
create policy anotacoes_excluir on public.anotacoes_aluno for delete
  using (public.eh_perfil('admin') or autor_id = auth.uid());

-- auditoria -----------------------------------------------------------
create policy auditoria_ler on public.auditoria for select
  using (public.eh_perfil('admin'));

-- ---------------------------------------------------------------------
-- Storage: buckets privados (acesso por URL assinada)
-- Caminho dos arquivos: <aluno_id>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy storage_ler on storage.objects for select
  using (
    bucket_id in ('fotos', 'documentos')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.eh_perfil('semeduc', 'admin')
      or (bucket_id = 'fotos' and public.eh_perfil('semtransp', 'motorista'))
    )
  );
create policy storage_inserir on storage.objects for insert
  with check (bucket_id in ('fotos', 'documentos') and public.eh_perfil('semeduc', 'admin'));
create policy storage_alterar on storage.objects for update
  using (bucket_id in ('fotos', 'documentos') and public.eh_perfil('semeduc', 'admin'));
create policy storage_excluir on storage.objects for delete
  using (bucket_id in ('fotos', 'documentos') and public.eh_perfil('semeduc', 'admin'));

-- ---------------------------------------------------------------------
-- Copia a escala modelo de um dia da semana para outro, numa única
-- transação (roda com as permissões de quem chama: RLS vale).
-- ---------------------------------------------------------------------
create or replace function public.copiar_escala_modelo(p_origem smallint, p_destino smallint)
returns int
language plpgsql
as $$
declare
  v_total int;
begin
  if not public.eh_perfil('semtransp', 'admin') then
    raise exception 'Você não tem permissão para alterar a escala.' using errcode = 'P0001';
  end if;
  delete from public.escala_modelo where dia_semana = p_destino;
  insert into public.escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id)
  select e.viagem_modelo_id, p_destino, e.onibus_id, e.motorista_id
    from public.escala_modelo e
    join public.viagens_modelo vm on vm.id = e.viagem_modelo_id
   where e.dia_semana = p_origem
     and p_destino = any (vm.dias_semana);
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- >>> supabase/migrations/20261023000300_dados_iniciais.sql
-- =====================================================================
-- Fase 1 — Dados iniciais: parâmetros e grade geral de viagens (seção 5)
-- km_estimado fica em branco: a SEMTRANSP preenche pela tela.
-- =====================================================================

insert into public.parametros (chave, valor, tipo, rotulo, descricao) values
  ('reserva_abertura_dias_antes', '1', 'numero', 'Abertura da reserva (dias antes)',
   'Quantos dias antes da viagem a reserva abre.'),
  ('reserva_abertura_hora', '"00:00"', 'hora', 'Abertura da reserva (horário)',
   'Horário em que a reserva abre no dia de abertura.'),
  ('qr_janela_antes_min', '60', 'numero', 'QR: minutos antes da saída',
   'A partir de quantos minutos antes da saída o QR é aceito.'),
  ('qr_janela_depois_min', '30', 'numero', 'QR: minutos depois da saída',
   'Até quantos minutos depois da saída o QR é aceito.'),
  ('qr_distancia_max_m', '200', 'numero', 'QR: distância máxima (metros)',
   'Distância máxima entre o celular do aluno e o do motorista.'),
  ('localizacao_motorista_validade_min', '10', 'numero', 'Localização do motorista válida por (min)',
   'Depois desse tempo sem atualização, o embarque é aceito sem verificar a localização.'),
  ('auto_encerrar_horas', '4', 'numero', 'Encerrar viagem automaticamente após (horas)',
   'Horas após a saída para encerrar viagens esquecidas e lançar as faltas.'),
  ('matricula_aviso_dias', '15', 'numero', 'Aviso de matrícula vencendo (dias)',
   'Quantos dias antes do vencimento o aluno é avisado.'),
  ('frota_aviso_dias', '30', 'numero', 'Aviso de vencimentos da frota (dias)',
   'Antecedência dos alertas de CNH, vistoria e licenciamento.'),
  ('lembrete_reserva_ativo', 'true', 'booleano', 'Enviar lembrete de reserva',
   'Lembra o aluno que tem a viagem na grade e ainda não reservou.'),
  ('lembrete_reserva_minutos_antes', '120', 'numero', 'Lembrete: minutos antes do prazo',
   'Com quanta antecedência do prazo o lembrete é enviado.'),
  ('termo_versao', '"1.0"', 'texto', 'Versão do termo de uso',
   'Ao mudar a versão, todos os alunos precisam aceitar o termo de novo.');

insert into public.viagens_modelo
  (cidade, nome, sentido, hora_saida, duracao_min, prazo_tipo, prazo_hora, condicional)
values
  -- Campos dos Goytacazes
  ('campos', 'Ida manhã',   'ida',   '05:30', 75, 'dia_anterior', '19:00', false),
  ('campos', 'Ida tarde',   'ida',   '11:00', 75, 'mesmo_dia',    '08:00', false),
  ('campos', 'Ida noite',   'ida',   '16:30', 75, 'mesmo_dia',    '15:00', false),
  ('campos', 'Volta 12:00', 'volta', '12:00', 75, 'mesmo_dia',    '10:00', false),
  ('campos', 'Volta tarde', 'volta', '18:15', 75, 'mesmo_dia',    '15:00', false),
  ('campos', 'Volta noite', 'volta', '22:00', 75, 'mesmo_dia',    '15:00', false),
  -- Itaperuna
  ('itaperuna', 'Ida manhã',   'ida',   '06:00', 60, 'dia_anterior', '19:00', false),
  ('itaperuna', 'Ida tarde',   'ida',   '11:00', 60, 'mesmo_dia',    '08:00', false),
  ('itaperuna', 'Ida noite',   'ida',   '17:00', 60, 'mesmo_dia',    '15:00', false),
  ('itaperuna', 'Volta tarde', 'volta', '18:20', 60, 'mesmo_dia',    '15:00', false),
  ('itaperuna', 'Volta 20:30', 'volta', '20:30', 60, null,           null,    true),
  ('itaperuna', 'Volta noite', 'volta', '22:00', 60, 'mesmo_dia',    '15:00', false),
  -- Deslocamentos vazios (não aparecem para reserva; só escala e km)
  ('campos',    'Retorno vazio da ida manhã', 'deslocamento_vazio', '06:50', 75, null, null, false),
  ('itaperuna', 'Retorno vazio da ida manhã', 'deslocamento_vazio', '07:05', 60, null, null, false);

commit;
