-- =====================================================================
-- Fase 6 — relatórios, km, vencimentos e auditoria consultável.
--
--  * Funções de relatório (agregam no banco; a tela e o Excel usam as mesmas).
--  * km do retorno vazio por viagem modelo (ex.: ida da manhã volta vazia a
--    Italva): soma automaticamente a cada ônibus que fez a viagem.
--  * Auditoria: o Admin vê tudo; SEMEDUC e SEMTRANSP veem só as tabelas delas.
-- =====================================================================

alter table public.viagens_modelo
  add column if not exists km_retorno_vazio numeric(7, 1) not null default 0 check (km_retorno_vazio >= 0);
comment on column public.viagens_modelo.km_retorno_vazio is
  'km do deslocamento vazio depois desta viagem (ex.: ida da manhã volta vazia a Italva). Entra no km rodado.';

insert into public.parametros (chave, valor, tipo, rotulo, descricao) values
  ('alerta_vencimento_dias', '30', 'numero', 'Alertas de vencimento: dias antes',
   'Com quantos dias de antecedência CNH, vistoria e licenciamento aparecem nos alertas do painel.')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Auditoria por secretaria
-- ---------------------------------------------------------------------
create or replace function public.tabelas_auditoria_do_perfil()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.eh_perfil('semeduc') then array[
      'alunos', 'aluno_vinculos', 'aluno_viagens', 'aluno_pontos_volta', 'grade_semanal', 'anotacoes_aluno',
      'instituicoes', 'semestres', 'calendario', 'pre_cadastros', 'justificativas', 'excecoes', 'frequencia', 'usuarios']
    when public.eh_perfil('semtransp') then array[
      'onibus', 'motoristas', 'pontos', 'viagens_modelo', 'escala_modelo', 'parametros', 'viagens_dia',
      'viagem_dia_onibus', 'embarques', 'usuarios']
    else array[]::text[]
  end;
$$;

drop policy if exists auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select
  using (
    public.eh_perfil('admin')
    or (
      tabela = any (public.tabelas_auditoria_do_perfil())
      -- Em "usuarios", cada secretaria vê só as contas do seu público.
      and (tabela <> 'usuarios' or coalesce(depois, antes) ->> 'perfil' =
            case when public.eh_perfil('semeduc') then 'aluno' else 'motorista' end)
    )
  );
create index if not exists auditoria_usuario_idx on public.auditoria (usuario_id, criado_em desc);

-- ---------------------------------------------------------------------
-- Filtro de aluno por vínculo acadêmico (instituição, curso, turno).
-- ---------------------------------------------------------------------
create or replace function public.aluno_no_filtro(p_aluno uuid, p_instituicao uuid, p_curso text, p_turno text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_instituicao is null and nullif(trim(coalesce(p_curso, '')), '') is null and p_turno is null)
      or exists (
           select 1 from public.aluno_vinculos v
            where v.aluno_id = p_aluno
              and (p_instituicao is null or v.instituicao_id = p_instituicao)
              and (nullif(trim(coalesce(p_curso, '')), '') is null or v.curso ilike '%' || trim(p_curso) || '%')
              and (p_turno is null or v.turno::text = p_turno));
$$;

-- ---------------------------------------------------------------------
-- SEMEDUC: frequência por aluno (ranking de faltas e "não retornou").
-- ---------------------------------------------------------------------
create or replace function public.relatorio_frequencia(
  p_de date, p_ate date, p_instituicao uuid default null, p_curso text default null, p_turno text default null)
returns table (aluno_id uuid, nome text, cpf text, telefone text, viagens bigint, presencas bigint, faltas bigint,
               justificadas bigint, nao_retornou bigint, perc_faltas numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_perfil('semeduc', 'admin') then
    raise exception 'Relatório da Secretaria de Educação.' using errcode = 'P0001';
  end if;
  return query
  select u.id, u.nome::text, u.cpf::text, u.telefone::text,
         count(*),
         count(*) filter (where f.resultado::text = 'presente'),
         count(*) filter (where f.resultado::text = 'falta'),
         count(*) filter (where f.resultado::text = 'justificada'),
         count(*) filter (where f.resultado::text = 'nao_retornou'),
         round(100.0 * count(*) filter (where f.resultado::text = 'falta')
               / nullif(count(*) filter (where f.resultado::text <> 'anulada'), 0), 1)
    from public.frequencia f
    join public.viagens_dia d on d.id = f.viagem_dia_id
    join public.usuarios u on u.id = f.aluno_id
   where d.data between p_de and p_ate
     and public.aluno_no_filtro(f.aluno_id, p_instituicao, p_curso, p_turno)
   group by u.id, u.nome, u.cpf, u.telefone
   order by 7 desc, 9 desc, u.nome;
end;
$$;

-- ---------------------------------------------------------------------
-- SEMEDUC: uso real × rotas liberadas.
-- ---------------------------------------------------------------------
create or replace function public.relatorio_uso(
  p_de date, p_ate date, p_instituicao uuid default null, p_curso text default null, p_turno text default null)
returns table (aluno_id uuid, nome text, cpf text, telefone text, rotas bigint, reservas bigint, ultima_viagem date)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_perfil('semeduc', 'admin') then
    raise exception 'Relatório da Secretaria de Educação.' using errcode = 'P0001';
  end if;
  return query
  select u.id, u.nome::text, u.cpf::text, u.telefone::text,
         (select count(*) from public.aluno_viagens av where av.aluno_id = a.usuario_id)
           + (select count(*) from public.grade_semanal g where g.aluno_id = a.usuario_id),
         (select count(*) from public.reservas r join public.viagens_dia d on d.id = r.viagem_dia_id
           where r.aluno_id = a.usuario_id and r.status = 'ativa' and d.data between p_de and p_ate),
         (select max(d.data) from public.reservas r join public.viagens_dia d on d.id = r.viagem_dia_id
           where r.aluno_id = a.usuario_id and r.status = 'ativa' and d.data <= public.hoje_sp())
    from public.alunos a
    join public.usuarios u on u.id = a.usuario_id
   where a.situacao = 'ativo' and u.ativo
     and public.aluno_no_filtro(a.usuario_id, p_instituicao, p_curso, p_turno)
   order by 6, u.nome;
end;
$$;

-- ---------------------------------------------------------------------
-- SEMTRANSP: ocupação média por viagem e dia da semana.
-- ---------------------------------------------------------------------
create or replace function public.relatorio_ocupacao(p_de date, p_ate date, p_cidade text default null)
returns table (cidade public.cidade, viagem text, sentido public.sentido, hora_saida time, dia_semana smallint,
               viagens bigint, media_reservas numeric, media_embarcados numeric, media_capacidade numeric, ocupacao numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_perfil('semtransp', 'admin') then
    raise exception 'Relatório da Secretaria de Transportes.' using errcode = 'P0001';
  end if;
  return query
  with por_viagem as (
    select d.id, d.cidade, d.viagem_modelo_id, public.dia_semana_iso(d.data) as dia,
           (select count(*) from public.reservas r where r.viagem_dia_id = d.id and r.status = 'ativa') as reservas,
           (select count(*) from public.embarques e join public.reservas r on r.id = e.reserva_id where r.viagem_dia_id = d.id) as embarcados,
           (select coalesce(sum(o.capacidade), 0) from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
             where x.viagem_dia_id = d.id) as capacidade
      from public.viagens_dia d
     where d.data between p_de and least(p_ate, public.hoje_sp())
       and d.saida_em <= public.agora()
       and d.status <> 'cancelada' and d.sentido in ('ida', 'volta')
       and (p_cidade is null or d.cidade::text = p_cidade)
  )
  select p.cidade, m.nome, m.sentido, m.hora_saida, p.dia::smallint,
         count(*),
         round(avg(p.reservas), 1),
         round(avg(p.embarcados), 1),
         round(avg(p.capacidade), 1),
         round(100.0 * sum(p.embarcados) / nullif(sum(p.capacidade), 0), 1)
    from por_viagem p join public.viagens_modelo m on m.id = p.viagem_modelo_id
   group by p.cidade, m.nome, m.sentido, m.hora_saida, p.dia
   order by p.cidade, m.hora_saida, m.sentido, p.dia;
end;
$$;

-- ---------------------------------------------------------------------
-- SEMTRANSP: previsão de lotação (alunos com a viagem liberada × lugares da escala).
-- ---------------------------------------------------------------------
create or replace function public.relatorio_previsao(p_cidade text default null)
returns table (cidade public.cidade, viagem text, sentido public.sentido, hora_saida time, dia_semana smallint,
               alunos bigint, capacidade bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_perfil('semtransp', 'admin') then
    raise exception 'Relatório da Secretaria de Transportes.' using errcode = 'P0001';
  end if;
  return query
  with dias as (
    select m.*, unnest(m.dias_semana) as dia
      from public.viagens_modelo m
     where m.ativa and not m.condicional and m.sentido in ('ida', 'volta')
       and (p_cidade is null or m.cidade::text = p_cidade)
  ),
  ativos as (
    select a.usuario_id from public.alunos a join public.usuarios u on u.id = a.usuario_id
     where a.situacao = 'ativo' and u.ativo and a.matricula_validade >= public.hoje_sp()
  )
  select d.cidade, d.nome, d.sentido, d.hora_saida, d.dia,
         (select count(*) from ativos t
           where exists (select 1 from public.aluno_viagens av where av.aluno_id = t.usuario_id and av.viagem_modelo_id = d.id)
              or exists (select 1 from public.grade_semanal g where g.aluno_id = t.usuario_id and g.dia_semana = d.dia
                           and d.id = case when d.sentido = 'ida' then g.viagem_ida_modelo_id else g.viagem_volta_modelo_id end)),
         (select coalesce(sum(o.capacidade), 0) from public.escala_modelo e join public.onibus o on o.id = e.onibus_id
           where e.viagem_modelo_id = d.id and e.dia_semana = d.dia and o.situacao = 'ativo')::bigint
    from dias d
   order by d.cidade, d.hora_saida, d.sentido, d.dia;
end;
$$;

-- ---------------------------------------------------------------------
-- SEMTRANSP: km rodado estimado (cada ônibus que fez a viagem × km, mais o
-- retorno vazio). Realizada = ônibus iniciou o trecho ou viagem encerrada.
-- ---------------------------------------------------------------------
create or replace function public.relatorio_km(p_de date, p_ate date, p_cidade text default null)
returns table (cidade public.cidade, viagem text, sentido public.sentido, hora_saida time,
               realizadas bigint, km_viagem numeric, km_vazio numeric, km_total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_perfil('semtransp', 'admin') then
    raise exception 'Relatório da Secretaria de Transportes.' using errcode = 'P0001';
  end if;
  return query
  select m.cidade, m.nome, m.sentido, m.hora_saida,
         count(*),
         coalesce(m.km_estimado, 0),
         m.km_retorno_vazio,
         count(*) * (coalesce(m.km_estimado, 0) + m.km_retorno_vazio)
    from public.viagem_dia_onibus x
    join public.viagens_dia d on d.id = x.viagem_dia_id
    join public.viagens_modelo m on m.id = d.viagem_modelo_id
   where d.data between p_de and least(p_ate, public.hoje_sp())
     and d.status <> 'cancelada'
     and (x.iniciada_em is not null or d.status = 'encerrada')
     and (p_cidade is null or d.cidade::text = p_cidade)
   group by m.id, m.cidade, m.nome, m.sentido, m.hora_saida, m.km_estimado, m.km_retorno_vazio
   order by m.cidade, m.hora_saida, m.sentido;
end;
$$;

-- ---------------------------------------------------------------------
-- SEMTRANSP: vencimentos da frota (CNH, vistoria, licenciamento).
-- ---------------------------------------------------------------------
create or replace function public.vencimentos_frota(p_dias int default null)
returns table (tipo text, quem text, detalhe text, validade date, dias int)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_dias int := coalesce(p_dias, public.parametro_num('alerta_vencimento_dias', 30)::int);
  v_hoje date := public.hoje_sp();
begin
  if not public.eh_perfil('semtransp', 'admin') then
    raise exception 'Relatório da Secretaria de Transportes.' using errcode = 'P0001';
  end if;
  return query
  select * from (
    select 'CNH'::text, u.nome, 'Categoria ' || m.cnh_categoria, m.cnh_validade, (m.cnh_validade - v_hoje)::int
      from public.motoristas m join public.usuarios u on u.id = m.usuario_id
     where u.ativo and u.perfil = 'motorista' and m.cnh_validade is not null and m.cnh_validade <= v_hoje + v_dias
    union all
    select 'Vistoria', 'Ônibus ' || o.prefixo, o.placa, o.vistoria_validade, (o.vistoria_validade - v_hoje)::int
      from public.onibus o where o.vistoria_validade is not null and o.vistoria_validade <= v_hoje + v_dias
    union all
    select 'Licenciamento', 'Ônibus ' || o.prefixo, o.placa, o.licenciamento_validade, (o.licenciamento_validade - v_hoje)::int
      from public.onibus o where o.licenciamento_validade is not null and o.licenciamento_validade <= v_hoje + v_dias
    union all
    select 'CNH sem validade', u.nome, 'Cadastre a validade da CNH', null::date, null::int
      from public.motoristas m join public.usuarios u on u.id = m.usuario_id
     where u.ativo and u.perfil = 'motorista' and m.cnh_validade is null
  ) t
  order by 5 nulls first, 2;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.relatorio_frequencia(date, date, uuid, text, text), public.relatorio_uso(date, date, uuid, text, text),
      public.relatorio_ocupacao(date, date, text), public.relatorio_previsao(text), public.relatorio_km(date, date, text),
      public.vencimentos_frota(int) from anon';
  end if;
end;
$$;
