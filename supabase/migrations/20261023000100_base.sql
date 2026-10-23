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
