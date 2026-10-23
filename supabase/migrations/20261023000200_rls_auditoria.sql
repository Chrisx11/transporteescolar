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
