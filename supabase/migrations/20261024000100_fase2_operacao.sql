-- =====================================================================
-- Fase 2 — Reservas e operação do dia
-- Viagens do dia, escala do dia, reservas, alocação, avisos e rotinas.
-- Todo horário é calculado em America/Sao_Paulo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Relógio do sistema (permite fixar a hora nos testes automatizados)
-- ---------------------------------------------------------------------
create or replace function public.agora()
returns timestamptz
language sql
stable
as $$
  select case
    when current_setting('app.ambiente', true) = 'teste'
         and nullif(current_setting('app.agora', true), '') is not null
      then current_setting('app.agora', true)::timestamptz
    else now()
  end;
$$;
comment on function public.agora() is
  'Hora atual. Só nos testes (app.ambiente = teste) pode ser fixada por app.agora.';

create or replace function public.hoje_sp()
returns date
language sql
stable
as $$
  select (public.agora() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.dia_semana_iso(p_data date)
returns smallint
language sql
immutable
as $$
  select extract(isodow from p_data)::smallint;
$$;

create or replace function public.parametro_num(p_chave text, p_padrao numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (valor #>> '{}')::numeric from public.parametros where chave = p_chave), p_padrao);
$$;

create or replace function public.parametro_texto(p_chave text, p_padrao text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select valor #>> '{}' from public.parametros where chave = p_chave), p_padrao);
$$;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.status_viagem as enum
  ('agendada', 'prazo_fechado', 'em_andamento', 'encerrada', 'cancelada', 'com_ocorrencia');
create type public.status_reserva as enum ('ativa', 'cancelada');
create type public.status_notificacao as enum ('pendente', 'enviada', 'falhou');
create type public.canal_notificacao as enum ('app', 'whatsapp', 'push');

-- ---------------------------------------------------------------------
-- Viagens do dia (cópia dos dados da viagem modelo na data)
-- ---------------------------------------------------------------------
create table public.viagens_dia (
  id uuid primary key default gen_random_uuid(),
  viagem_modelo_id uuid not null references public.viagens_modelo (id) on delete restrict,
  data date not null,
  cidade public.cidade not null,
  sentido public.sentido not null,
  nome text not null,
  saida_em timestamptz not null,
  duracao_min int not null,
  abertura_em timestamptz,
  prazo_em timestamptz,
  bloqueia_ao_lotar boolean not null default false,
  status public.status_viagem not null default 'agendada',
  ocorrencia_descricao text,
  alocada_em timestamptz,
  criada_em timestamptz not null default now(),
  unique (viagem_modelo_id, data),
  check (sentido = 'deslocamento_vazio' or (abertura_em is not null and prazo_em is not null)),
  check (abertura_em is null or abertura_em < prazo_em)
);
comment on table public.viagens_dia is 'Viagem concreta numa data. Horários copiados da viagem modelo na geração.';
create index viagens_dia_data_idx on public.viagens_dia (data, saida_em);
create index viagens_dia_prazo_idx on public.viagens_dia (status, prazo_em);

-- Escala do dia (copiada da escala modelo; pode ser ajustada)
create table public.viagem_dia_onibus (
  id uuid primary key default gen_random_uuid(),
  viagem_dia_id uuid not null references public.viagens_dia (id) on delete cascade,
  onibus_id uuid not null references public.onibus (id) on delete restrict,
  motorista_id uuid references public.motoristas (usuario_id) on delete set null,
  extra boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (viagem_dia_id, onibus_id)
);
create index viagem_dia_onibus_motorista_idx on public.viagem_dia_onibus (motorista_id);

-- RN11 no dia: mesmo ônibus/motorista em viagens que se sobrepõem.
create or replace function public.validar_viagem_dia_onibus()
returns trigger
language plpgsql
as $$
declare
  v public.viagens_dia;
  c record;
begin
  select * into v from public.viagens_dia where id = new.viagem_dia_id;
  select vd.nome, vd.cidade, vd.saida_em, (x.onibus_id = new.onibus_id) as mesmo_onibus
    into c
    from public.viagem_dia_onibus x
    join public.viagens_dia vd on vd.id = x.viagem_dia_id
   where x.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and x.viagem_dia_id <> new.viagem_dia_id
     and vd.status not in ('cancelada')
     and (x.onibus_id = new.onibus_id or (new.motorista_id is not null and x.motorista_id = new.motorista_id))
     and vd.saida_em < v.saida_em + make_interval(mins => v.duracao_min)
     and v.saida_em < vd.saida_em + make_interval(mins => vd.duracao_min)
   limit 1;
  if found then
    raise exception 'Conflito de horário: % já está em "%" (%) às %.',
      case when c.mesmo_onibus then 'este ônibus' else 'este motorista' end,
      c.nome, c.cidade, to_char(c.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger viagem_dia_onibus_validar before insert or update on public.viagem_dia_onibus
  for each row execute function public.validar_viagem_dia_onibus();

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  viagem_dia_id uuid not null references public.viagens_dia (id) on delete cascade,
  viagem_dia_onibus_id uuid references public.viagem_dia_onibus (id) on delete set null,
  ponto_id uuid references public.pontos (id) on delete set null,
  status public.status_reserva not null default 'ativa',
  criada_em timestamptz not null default now(),
  cancelada_em timestamptz,
  alocada_em timestamptz
);
-- No máximo uma reserva ativa por aluno por viagem.
create unique index reservas_uma_ativa_idx on public.reservas (aluno_id, viagem_dia_id) where status = 'ativa';
create index reservas_viagem_idx on public.reservas (viagem_dia_id, status);
create index reservas_onibus_idx on public.reservas (viagem_dia_onibus_id);

-- ---------------------------------------------------------------------
-- Avisos (fila). Fase 2: só canal "app". WhatsApp/push na Fase 5.
-- ---------------------------------------------------------------------
create table public.notificacoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  canal public.canal_notificacao not null default 'app',
  evento text not null,
  titulo text not null,
  conteudo text,
  referencia jsonb,
  status public.status_notificacao not null default 'pendente',
  lida_em timestamptz,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index notificacoes_usuario_idx on public.notificacoes (usuario_id, criado_em desc);

-- ---------------------------------------------------------------------
-- Mensagens dos motivos de bloqueio (mesmos códigos usados no app)
-- ---------------------------------------------------------------------
create or replace function public.mensagem_motivo(p_motivo text)
returns text
language sql
immutable
as $$
  select case p_motivo
    when 'cadastro_pendente' then 'Seu cadastro ainda está em análise pela Secretaria de Educação.'
    when 'cadastro_inativo' then 'Seu cadastro está inativo. Procure a Secretaria de Educação.'
    when 'matricula_sem_validade' then 'Sua matrícula ainda não foi conferida pela Secretaria de Educação.'
    when 'matricula_vencida' then 'Sua matrícula estará vencida nesta data. Envie um comprovante novo.'
    when 'fora_da_grade' then 'Esta viagem não está na sua grade para este dia.'
    when 'sem_operacao' then 'Não há transporte nesta data (feriado ou recesso).'
    when 'sem_aula' then 'Não há aula na sua instituição nesta data.'
    when 'fora_do_semestre' then 'Esta data está fora do semestre letivo da sua instituição.'
    when 'nao_gerada' then 'Esta viagem ainda não está disponível.'
    when 'nao_reservavel' then 'Esta viagem não aceita reservas.'
    when 'viagem_cancelada' then 'Esta viagem foi cancelada.'
    when 'ainda_nao_abriu' then 'A reserva desta viagem ainda não abriu.'
    when 'prazo_encerrado' then 'O prazo para reservar ou cancelar já terminou.'
    when 'lotada' then 'Esta viagem está lotada.'
    else 'Não é possível reservar esta viagem.'
  end;
$$;

-- ---------------------------------------------------------------------
-- Regras da reserva (RN01, RN03, RN05, RN07, RN08, RN09).
-- Retorna o código do motivo de bloqueio, ou null se pode reservar.
-- ---------------------------------------------------------------------
create or replace function public.motivo_bloqueio(p_aluno uuid, p_viagem uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.alunos;
  v public.viagens_dia;
  g public.grade_semanal;
  v_capacidade int;
  v_reservas int;
begin
  select * into a from public.alunos where usuario_id = p_aluno;
  if not found or a.situacao = 'pendente' then return 'cadastro_pendente'; end if;
  if a.situacao = 'inativo' then return 'cadastro_inativo'; end if;

  select * into v from public.viagens_dia where id = p_viagem;
  if not found then return 'nao_gerada'; end if;
  if v.sentido = 'deslocamento_vazio' then return 'nao_reservavel'; end if;

  if a.matricula_validade is null then return 'matricula_sem_validade'; end if;
  if a.matricula_validade < v.data then return 'matricula_vencida'; end if;

  select * into g from public.grade_semanal
   where aluno_id = p_aluno and dia_semana = public.dia_semana_iso(v.data);
  if not found or v.viagem_modelo_id is distinct from
       (case when v.sentido = 'ida' then g.viagem_ida_modelo_id else g.viagem_volta_modelo_id end) then
    return 'fora_da_grade';
  end if;

  if exists (select 1 from public.calendario
              where instituicao_id is null and data = v.data and tipo in ('feriado', 'recesso')) then
    return 'sem_operacao';
  end if;

  if g.instituicao_id is not null then
    if exists (select 1 from public.calendario where instituicao_id = g.instituicao_id and data = v.data) then
      return 'sem_aula';
    end if;
    if exists (select 1 from public.semestres where instituicao_id = g.instituicao_id)
       and not exists (select 1 from public.semestres
                        where instituicao_id = g.instituicao_id and v.data between inicio and fim) then
      return 'fora_do_semestre';
    end if;
  end if;

  if v.status = 'cancelada' then return 'viagem_cancelada'; end if;
  if v.status <> 'agendada' then return 'prazo_encerrado'; end if;
  if public.agora() < v.abertura_em then return 'ainda_nao_abriu'; end if;
  if public.agora() >= v.prazo_em then return 'prazo_encerrado'; end if;

  -- Lotação: ida nunca bloqueia; volta só se a viagem modelo mandar.
  if v.sentido = 'volta' and v.bloqueia_ao_lotar then
    select coalesce(sum(o.capacidade), 0) into v_capacidade
      from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
     where x.viagem_dia_id = v.id;
    select count(*) into v_reservas from public.reservas where viagem_dia_id = v.id and status = 'ativa';
    if v_reservas >= v_capacidade and not exists (
         select 1 from public.reservas where viagem_dia_id = v.id and aluno_id = p_aluno and status = 'ativa') then
      return 'lotada';
    end if;
  end if;

  return null;
end;
$$;

-- Ponto de embarque do aluno para a viagem: o do dia na grade, senão o padrão.
create or replace function public.ponto_do_aluno(p_aluno uuid, p_viagem uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case when v.sentido = 'ida' then g.ponto_ida_id else g.ponto_volta_id end,
    case when v.sentido = 'ida'
      then (select ponto_ida_padrao_id from public.alunos where usuario_id = p_aluno)
      else (select ponto_id from public.aluno_pontos_volta where aluno_id = p_aluno and cidade = v.cidade)
    end)
  from public.viagens_dia v
  left join public.grade_semanal g on g.aluno_id = p_aluno and g.dia_semana = public.dia_semana_iso(v.data)
  where v.id = p_viagem;
$$;

-- ---------------------------------------------------------------------
-- Ações do aluno
-- ---------------------------------------------------------------------
create or replace function public.reservar(p_viagem uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  v_motivo text;
  v_id uuid;
begin
  if v_aluno is null or not public.eh_perfil('aluno') then
    raise exception 'Entre como aluno para reservar.' using errcode = 'P0001';
  end if;
  -- Trava a viagem: reservas simultâneas são conferidas uma de cada vez.
  perform 1 from public.viagens_dia where id = p_viagem for update;

  select id into v_id from public.reservas where aluno_id = v_aluno and viagem_dia_id = p_viagem and status = 'ativa';
  if found then return v_id; end if;

  v_motivo := public.motivo_bloqueio(v_aluno, p_viagem);
  if v_motivo is not null then
    raise exception '%', public.mensagem_motivo(v_motivo) using errcode = 'P0001';
  end if;

  insert into public.reservas (aluno_id, viagem_dia_id, ponto_id)
  values (v_aluno, p_viagem, public.ponto_do_aluno(v_aluno, p_viagem))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancelar_reserva(p_reserva uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservas;
  v public.viagens_dia;
begin
  select * into r from public.reservas where id = p_reserva and aluno_id = auth.uid() and status = 'ativa' for update;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0001';
  end if;
  select * into v from public.viagens_dia where id = r.viagem_dia_id;
  if v.status <> 'agendada' or public.agora() >= v.prazo_em then
    raise exception '%', public.mensagem_motivo('prazo_encerrado') using errcode = 'P0001';
  end if;
  update public.reservas set status = 'cancelada', cancelada_em = public.agora() where id = r.id;
end;
$$;

-- Ida e volta da grade do aluno numa data, com a situação de cada uma (RN01).
create or replace function public.minhas_viagens(p_data date)
returns table (
  sentido public.sentido,
  viagem_dia_id uuid,
  nome text,
  cidade public.cidade,
  saida_em timestamptz,
  abertura_em timestamptz,
  prazo_em timestamptz,
  status_viagem public.status_viagem,
  reserva_id uuid,
  onibus_prefixo text,
  ponto_nome text,
  motivo text,
  mensagem text,
  pode_cancelar boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_aluno uuid := auth.uid();
  g public.grade_semanal;
  m record;
  v public.viagens_dia;
  r public.reservas;
  v_motivo text;
begin
  if v_aluno is null then return; end if;
  select * into g from public.grade_semanal where aluno_id = v_aluno and dia_semana = public.dia_semana_iso(p_data);
  if not found then return; end if;

  for m in
    select vm.*, s.ordem
      from (values (g.viagem_ida_modelo_id, 1), (g.viagem_volta_modelo_id, 2)) as s(modelo_id, ordem)
      join public.viagens_modelo vm on vm.id = s.modelo_id
     order by s.ordem
  loop
    select * into v from public.viagens_dia where viagem_modelo_id = m.id and data = p_data;
    r := null;
    if v.id is not null then
      select * into r from public.reservas
       where aluno_id = v_aluno and viagem_dia_id = v.id and status = 'ativa';
      v_motivo := public.motivo_bloqueio(v_aluno, v.id);
    elsif exists (select 1 from public.calendario
                   where instituicao_id is null and data = p_data and tipo in ('feriado', 'recesso')) then
      v_motivo := 'sem_operacao';
    else
      v_motivo := 'nao_gerada';
    end if;

    sentido := m.sentido;
    viagem_dia_id := v.id;
    nome := m.nome;
    cidade := m.cidade;
    saida_em := coalesce(v.saida_em, (p_data + m.hora_saida) at time zone 'America/Sao_Paulo');
    abertura_em := v.abertura_em;
    prazo_em := v.prazo_em;
    status_viagem := v.status;
    reserva_id := r.id;
    onibus_prefixo := (select o.prefixo from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
                        where x.id = r.viagem_dia_onibus_id);
    ponto_nome := (select p.nome from public.pontos p
                    where p.id = coalesce(r.ponto_id, case when v.id is not null then public.ponto_do_aluno(v_aluno, v.id) end));
    motivo := v_motivo;
    mensagem := case when v_motivo is null then null else public.mensagem_motivo(v_motivo) end;
    pode_cancelar := r.id is not null and v.status = 'agendada' and public.agora() < v.prazo_em;
    return next;
  end loop;
end;
$$;

create or replace function public.marcar_avisos_lidos()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notificacoes set lida_em = public.agora()
   where usuario_id = auth.uid() and lida_em is null;
$$;

-- ---------------------------------------------------------------------
-- Operação (SEMTRANSP / rotinas)
-- ---------------------------------------------------------------------

-- Rotinas e secretaria: quem roda sem usuário (pg_cron) ou SEMTRANSP/Admin.
create or replace function public.exigir_operacao()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.eh_perfil('semtransp', 'admin') then
    raise exception 'Você não tem permissão para esta ação.' using errcode = 'P0001';
  end if;
end;
$$;

-- Copia a escala modelo para uma viagem do dia (pula ônibus em manutenção e conflitos).
create or replace function public.copiar_escala_para_dia(p_viagem uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
  e record;
  n int := 0;
begin
  select * into v from public.viagens_dia where id = p_viagem;
  for e in
    select em.onibus_id, em.motorista_id
      from public.escala_modelo em
      join public.onibus o on o.id = em.onibus_id
     where em.viagem_modelo_id = v.viagem_modelo_id
       and em.dia_semana = public.dia_semana_iso(v.data)
       and o.situacao = 'ativo'
  loop
    begin
      insert into public.viagem_dia_onibus (viagem_dia_id, onibus_id, motorista_id)
      values (v.id, e.onibus_id, e.motorista_id)
      on conflict (viagem_dia_id, onibus_id) do nothing;
      n := n + 1;
    exception when sqlstate 'P0001' then
      null; -- conflito de horário: fica de fora, o painel mostra a viagem sem ônibus
    end;
  end loop;
  return n;
end;
$$;

-- Gera as viagens de hoje até p_dias à frente (pode rodar várias vezes).
create or replace function public.gerar_viagens_dia(p_dias int default 2)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
  m public.viagens_modelo;
  v_id uuid;
  v_total int := 0;
  v_dias_antes int := public.parametro_num('reserva_abertura_dias_antes', 1)::int;
  v_hora_abertura time := public.parametro_texto('reserva_abertura_hora', '00:00')::time;
begin
  perform public.exigir_operacao();
  for d in select generate_series(public.hoje_sp(), public.hoje_sp() + p_dias, interval '1 day')::date loop
    -- Feriado/recesso geral: não há viagens.
    continue when exists (select 1 from public.calendario
                           where instituicao_id is null and data = d and tipo in ('feriado', 'recesso'));
    for m in
      select * from public.viagens_modelo
       where ativa and not condicional and public.dia_semana_iso(d) = any (dias_semana)
    loop
      insert into public.viagens_dia
        (viagem_modelo_id, data, cidade, sentido, nome, saida_em, duracao_min, abertura_em, prazo_em, bloqueia_ao_lotar)
      values (
        m.id, d, m.cidade, m.sentido, m.nome,
        (d + m.hora_saida) at time zone 'America/Sao_Paulo',
        m.duracao_min,
        case when m.sentido <> 'deslocamento_vazio'
          then ((d - v_dias_antes) + v_hora_abertura) at time zone 'America/Sao_Paulo' end,
        public.calcular_prazo(d, m.prazo_tipo, m.prazo_hora),
        m.bloqueia_ao_lotar)
      on conflict (viagem_modelo_id, data) do nothing
      returning id into v_id;
      if v_id is not null then
        perform public.copiar_escala_para_dia(v_id);
        v_total := v_total + 1;
        v_id := null;
      end if;
    end loop;
  end loop;
  return v_total;
end;
$$;

-- Desfaz a escala do dia e copia de novo a escala modelo (só com prazo aberto).
create or replace function public.reaplicar_escala(p_viagem uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
begin
  perform public.exigir_operacao();
  select * into v from public.viagens_dia where id = p_viagem for update;
  if v.status <> 'agendada' or (v.prazo_em is not null and public.agora() >= v.prazo_em) then
    raise exception 'Só dá para reaplicar a escala enquanto o prazo está aberto.' using errcode = 'P0001';
  end if;
  delete from public.viagem_dia_onibus where viagem_dia_id = p_viagem;
  return public.copiar_escala_para_dia(p_viagem);
end;
$$;

/**
 * RN12 — Distribui os alunos reservados entre os ônibus da viagem:
 * - percorre os pontos na ordem da rota e põe cada ponto inteiro num ônibus
 *   quando cabe (de preferência o mesmo do ponto anterior);
 * - se não cabe em nenhum, divide pelo ônibus com mais lugares livres;
 * - se faltar lugar, distribui o excesso (o painel mostra o alerta).
 * Avisa "Seu ônibus" a quem teve o ônibus definido ou trocado após o prazo.
 */
create or replace function public.alocar_viagem(p_viagem uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
  ids uuid[];
  prefixos text[];
  livres int[];
  n int;
  atual int := 1;
  alvo int;
  i int;
  g record;
  restante int;
  k int;
  v_total int := 0;
  v_avisar boolean;
  v_antes jsonb;
begin
  perform public.exigir_operacao();
  select * into v from public.viagens_dia where id = p_viagem for update;

  select array_agg(x.id order by o.capacidade desc, o.prefixo),
         array_agg(o.prefixo order by o.capacidade desc, o.prefixo),
         array_agg(o.capacidade order by o.capacidade desc, o.prefixo)
    into ids, prefixos, livres
    from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
   where x.viagem_dia_id = p_viagem;
  n := coalesce(array_length(ids, 1), 0);

  -- Guarda a alocação anterior para avisar só quem mudou.
  select coalesce(jsonb_object_agg(id, viagem_dia_onibus_id), '{}'::jsonb) into v_antes
    from public.reservas where viagem_dia_id = p_viagem and status = 'ativa';

  update public.reservas set viagem_dia_onibus_id = null where viagem_dia_id = p_viagem and status = 'ativa';

  if n > 0 then
    for g in
      select r.ponto_id, count(*)::int as qt
        from public.reservas r left join public.pontos p on p.id = r.ponto_id
       where r.viagem_dia_id = p_viagem and r.status = 'ativa'
       group by r.ponto_id, p.ordem, p.nome
       order by p.ordem nulls last, p.nome nulls last
    loop
      alvo := null;
      if livres[atual] >= g.qt then
        alvo := atual;
      else
        for i in 1..n loop
          if livres[i] >= g.qt then alvo := i; exit; end if;
        end loop;
      end if;

      if alvo is not null then
        update public.reservas set viagem_dia_onibus_id = ids[alvo], alocada_em = public.agora()
         where viagem_dia_id = p_viagem and status = 'ativa' and ponto_id is not distinct from g.ponto_id;
        livres[alvo] := livres[alvo] - g.qt;
        atual := alvo;
      else
        -- Divide o ponto: enche o ônibus com mais lugares, depois o próximo.
        restante := g.qt;
        while restante > 0 loop
          alvo := 1;
          for i in 2..n loop
            if livres[i] > livres[alvo] then alvo := i; end if;
          end loop;
          k := case when livres[alvo] > 0 then least(livres[alvo], restante) else 1 end;
          update public.reservas set viagem_dia_onibus_id = ids[alvo], alocada_em = public.agora()
           where id in (select id from public.reservas
                         where viagem_dia_id = p_viagem and status = 'ativa'
                           and ponto_id is not distinct from g.ponto_id and viagem_dia_onibus_id is null
                         order by criada_em limit k);
          livres[alvo] := livres[alvo] - k;
          restante := restante - k;
          atual := alvo;
        end loop;
      end if;
      v_total := v_total + g.qt;
    end loop;
  end if;

  update public.viagens_dia set alocada_em = public.agora() where id = p_viagem;

  -- Aviso "Seu ônibus" (só depois do prazo, e só para quem mudou).
  v_avisar := v.status <> 'agendada';
  if v_avisar then
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    select r.aluno_id, 'onibus_atribuido',
           'Seu ônibus: ' || o.prefixo,
           v.nome || ' (' || case v.cidade when 'campos' then 'Campos' else 'Itaperuna' end || ') — saída às '
             || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI')
             || coalesce('. Embarque: ' || p.nome, '') || '.',
           jsonb_build_object('viagem_dia_id', v.id, 'reserva_id', r.id)
      from public.reservas r
      join public.viagem_dia_onibus x on x.id = r.viagem_dia_onibus_id
      join public.onibus o on o.id = x.onibus_id
      left join public.pontos p on p.id = r.ponto_id
     where r.viagem_dia_id = p_viagem and r.status = 'ativa'
       and r.viagem_dia_onibus_id::text is distinct from (v_antes ->> r.id::text);
  end if;

  return v_total;
end;
$$;

-- Rotina: fecha prazos vencidos e aloca (a cada 5 min).
create or replace function public.fechar_prazos()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  n int := 0;
begin
  perform public.exigir_operacao();
  for v_id in
    select id from public.viagens_dia
     where status = 'agendada' and prazo_em is not null and prazo_em <= public.agora()
     order by prazo_em
     for update skip locked
  loop
    update public.viagens_dia set status = 'prazo_fechado' where id = v_id;
    perform public.alocar_viagem(v_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- SEMTRANSP move um aluno para outro ônibus da mesma viagem.
create or replace function public.mover_reserva(p_reserva uuid, p_destino uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservas;
  v public.viagens_dia;
  v_prefixo text;
begin
  perform public.exigir_operacao();
  select * into r from public.reservas where id = p_reserva and status = 'ativa' for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.viagem_dia_onibus where id = p_destino and viagem_dia_id = r.viagem_dia_id) then
    raise exception 'O ônibus escolhido não está nesta viagem.' using errcode = 'P0001';
  end if;
  if r.viagem_dia_onibus_id = p_destino then return; end if;
  update public.reservas set viagem_dia_onibus_id = p_destino, alocada_em = public.agora() where id = p_reserva;

  select * into v from public.viagens_dia where id = r.viagem_dia_id;
  if v.status <> 'agendada' then
    select o.prefixo into v_prefixo from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
     where x.id = p_destino;
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    values (r.aluno_id, 'onibus_alterado', 'Seu ônibus mudou: ' || v_prefixo,
            v.nome || ' — saída às ' || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') || '.',
            jsonb_build_object('viagem_dia_id', v.id, 'reserva_id', r.id));
  end if;
end;
$$;

-- SEMTRANSP cancela a viagem do dia e avisa os reservados.
create or replace function public.cancelar_viagem(p_viagem uuid, p_motivo text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
  n int;
begin
  perform public.exigir_operacao();
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  select * into v from public.viagens_dia where id = p_viagem for update;
  if v.status in ('cancelada', 'encerrada') then
    raise exception 'Esta viagem não pode mais ser cancelada.' using errcode = 'P0001';
  end if;
  update public.viagens_dia set status = 'cancelada', ocorrencia_descricao = trim(p_motivo) where id = p_viagem;
  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  select r.aluno_id, 'viagem_cancelada', 'Viagem cancelada: ' || v.nome,
         'A viagem das ' || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' de '
           || to_char(v.data, 'DD/MM') || ' foi cancelada. Motivo: ' || trim(p_motivo),
         jsonb_build_object('viagem_dia_id', v.id)
    from public.reservas r where r.viagem_dia_id = p_viagem and r.status = 'ativa';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Quem roda sem login (anon) não chama as rotinas.
revoke execute on function public.gerar_viagens_dia(int), public.fechar_prazos(), public.alocar_viagem(uuid),
  public.reaplicar_escala(uuid), public.mover_reserva(uuid, uuid), public.cancelar_viagem(uuid, text),
  public.copiar_escala_para_dia(uuid), public.exigir_operacao(), public.motivo_bloqueio(uuid, uuid),
  public.ponto_do_aluno(uuid, uuid)
  from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.gerar_viagens_dia(int), public.fechar_prazos(),
      public.alocar_viagem(uuid), public.reaplicar_escala(uuid), public.mover_reserva(uuid, uuid),
      public.cancelar_viagem(uuid, text), public.copiar_escala_para_dia(uuid), public.exigir_operacao(),
      public.motivo_bloqueio(uuid, uuid), public.ponto_do_aluno(uuid, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Funções internas: só chamadas por outras funções (o Supabase concede a todos por padrão).
    execute 'revoke execute on function public.copiar_escala_para_dia(uuid), public.motivo_bloqueio(uuid, uuid),
      public.ponto_do_aluno(uuid, uuid) from authenticated';
    execute 'grant execute on function public.gerar_viagens_dia(int), public.fechar_prazos(),
      public.alocar_viagem(uuid), public.reaplicar_escala(uuid), public.mover_reserva(uuid, uuid),
      public.cancelar_viagem(uuid, text), public.exigir_operacao() to authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.viagens_dia enable row level security;
alter table public.viagem_dia_onibus enable row level security;
alter table public.reservas enable row level security;
alter table public.notificacoes enable row level security;

create policy viagens_dia_ler on public.viagens_dia for select to authenticated using (true);
create policy viagens_dia_escrever on public.viagens_dia for all
  using (public.eh_perfil('semtransp', 'admin')) with check (public.eh_perfil('semtransp', 'admin'));

create policy viagem_dia_onibus_ler on public.viagem_dia_onibus for select
  using (motorista_id = auth.uid() or public.eh_perfil('semtransp', 'semeduc', 'admin'));
create policy viagem_dia_onibus_escrever on public.viagem_dia_onibus for all
  using (public.eh_perfil('semtransp', 'admin')) with check (public.eh_perfil('semtransp', 'admin'));

-- Aluno lê as próprias reservas; grava só pelas funções reservar/cancelar.
create policy reservas_ler on public.reservas for select
  using (aluno_id = auth.uid() or public.eh_perfil('semtransp', 'semeduc', 'admin'));

-- Motorista vê as reservas do(s) ônibus em que está escalado.
create or replace function public.eh_motorista_do_onibus_dia(p_vdo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.viagem_dia_onibus where id = p_vdo and motorista_id = auth.uid());
$$;
create policy reservas_ler_motorista on public.reservas for select
  using (viagem_dia_onibus_id is not null and public.eh_motorista_do_onibus_dia(viagem_dia_onibus_id));

create policy notificacoes_ler on public.notificacoes for select
  using (usuario_id = auth.uid() or public.eh_perfil('admin'));

-- Auditoria das tabelas novas
create trigger viagens_dia_auditoria after insert or update or delete on public.viagens_dia
  for each row execute function public.registrar_auditoria();
create trigger viagem_dia_onibus_auditoria after insert or update or delete on public.viagem_dia_onibus
  for each row execute function public.registrar_auditoria();
create trigger reservas_auditoria after insert or update or delete on public.reservas
  for each row execute function public.registrar_auditoria();

-- Tempo real (painel do dia) — só no Supabase, onde a publicação existe.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.viagens_dia, public.viagem_dia_onibus, public.reservas;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Rotinas automáticas (pg_cron, horários em UTC: 03:05 UTC = 00:05 SP)
-- Ative antes a extensão pg_cron em Database → Extensions.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gerar-viagens-dia', '5 3 * * *', 'select public.gerar_viagens_dia(2)');
    perform cron.schedule('fechar-prazos', '*/5 * * * *', 'select public.fechar_prazos()');
  end if;
end;
$$;
