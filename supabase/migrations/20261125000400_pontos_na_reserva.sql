-- =====================================================================
-- O aluno escolhe os pontos ao reservar:
--   ida   → embarca num ponto de Italva e desembarca na cidade da viagem;
--   volta → embarca na cidade da viagem e desembarca num ponto de Italva.
-- Enquanto o prazo está aberto, reservar de novo a mesma viagem troca os pontos.
-- A alocação continua agrupando pelo ponto de EMBARQUE (reservas.ponto_id).
-- =====================================================================

alter table public.reservas
  add column if not exists ponto_desembarque_id uuid references public.pontos (id) on delete set null;

-- Ponto ativo naquela cidade?
create or replace function public.ponto_na_cidade(p_ponto uuid, p_cidade public.cidade)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pontos where id = p_ponto and cidade = p_cidade and ativo);
$$;

drop function if exists public.reservar(uuid);
drop function if exists public.reservar(uuid, uuid, uuid);
create function public.reservar(p_viagem uuid, p_ponto_embarque uuid default null, p_ponto_desembarque uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  v public.viagens_dia;
  v_motivo text;
  v_id uuid;
  v_cid_emb public.cidade;
  v_cid_des public.cidade;
begin
  if v_aluno is null or not public.eh_perfil('aluno', 'admin') then
    raise exception 'Entre como aluno para reservar.' using errcode = 'P0001';
  end if;
  -- Trava a viagem: reservas simultâneas são conferidas uma de cada vez.
  select * into v from public.viagens_dia where id = p_viagem for update;
  if not found then raise exception 'Viagem não encontrada.' using errcode = 'P0001'; end if;

  v_cid_emb := case when v.sentido = 'ida' then 'italva' else v.cidade end;
  v_cid_des := case when v.sentido = 'ida' then v.cidade else 'italva' end;
  if p_ponto_embarque is not null and not public.ponto_na_cidade(p_ponto_embarque, v_cid_emb) then
    raise exception 'Escolha um ponto de embarque em %.', initcap(v_cid_emb::text) using errcode = 'P0001';
  end if;
  if p_ponto_desembarque is not null and not public.ponto_na_cidade(p_ponto_desembarque, v_cid_des) then
    raise exception 'Escolha um ponto de desembarque em %.', initcap(v_cid_des::text) using errcode = 'P0001';
  end if;

  v_motivo := public.motivo_bloqueio(v_aluno, p_viagem);

  select id into v_id from public.reservas where aluno_id = v_aluno and viagem_dia_id = p_viagem and status = 'ativa';
  if found then
    -- Já reservada: troca os pontos enquanto o prazo está aberto.
    if p_ponto_embarque is not null or p_ponto_desembarque is not null then
      if v_motivo is not null then
        raise exception '%', public.mensagem_motivo(v_motivo) using errcode = 'P0001';
      end if;
      update public.reservas
         set ponto_id = coalesce(p_ponto_embarque, ponto_id),
             ponto_desembarque_id = coalesce(p_ponto_desembarque, ponto_desembarque_id)
       where id = v_id;
    end if;
    return v_id;
  end if;

  if v_motivo is not null then
    raise exception '%', public.mensagem_motivo(v_motivo) using errcode = 'P0001';
  end if;

  insert into public.reservas (aluno_id, viagem_dia_id, ponto_id, ponto_desembarque_id)
  values (v_aluno, p_viagem, coalesce(p_ponto_embarque, public.ponto_do_aluno(v_aluno, p_viagem)), p_ponto_desembarque)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Tela do aluno: inclui os pontos escolhidos (embarque e desembarque).
-- ---------------------------------------------------------------------
drop function if exists public.minhas_viagens(date);
create function public.minhas_viagens(p_data date)
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
  pode_cancelar boolean,
  embarcado boolean,
  embarque_de timestamptz,
  embarque_ate timestamptz,
  resultado public.resultado_frequencia,
  ponto_embarque_id uuid,
  ponto_desembarque_id uuid,
  ponto_desembarque_nome text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_aluno uuid := auth.uid();
  v_dia smallint := public.dia_semana_iso(p_data);
  m record;
  v public.viagens_dia;
  r public.reservas;
  v_motivo text;
  v_antes int := public.parametro_num('qr_janela_antes_min', 60)::int;
  v_depois int := public.parametro_num('qr_janela_depois_min', 30)::int;
begin
  if v_aluno is null then return; end if;

  for m in
    select vm.* from public.viagens_modelo vm
     where vm.id in (
             select g.viagem_ida_modelo_id from public.grade_semanal g where g.aluno_id = v_aluno and g.dia_semana = v_dia
             union
             select g.viagem_volta_modelo_id from public.grade_semanal g where g.aluno_id = v_aluno and g.dia_semana = v_dia
             union
             select av.viagem_modelo_id from public.aluno_viagens av
               join public.viagens_modelo x on x.id = av.viagem_modelo_id
              where av.aluno_id = v_aluno and x.ativa and not x.condicional and v_dia = any (x.dias_semana))
     order by vm.hora_saida, vm.sentido, vm.cidade
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
    ponto_embarque_id := coalesce(r.ponto_id, case when v.id is not null then public.ponto_do_aluno(v_aluno, v.id) end);
    ponto_nome := (select p.nome from public.pontos p where p.id = ponto_embarque_id);
    ponto_desembarque_id := r.ponto_desembarque_id;
    ponto_desembarque_nome := (select p.nome from public.pontos p where p.id = r.ponto_desembarque_id);
    motivo := v_motivo;
    mensagem := case when v_motivo is null then null else public.mensagem_motivo(v_motivo) end;
    pode_cancelar := r.id is not null and v.status = 'agendada' and public.agora() < v.prazo_em;
    embarcado := r.id is not null and exists (select 1 from public.embarques e where e.reserva_id = r.id);
    embarque_de := saida_em - make_interval(mins => v_antes);
    embarque_ate := saida_em + make_interval(mins => v_depois);
    resultado := (select f.resultado from public.frequencia f where f.reserva_id = r.id);
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Lista do motorista: também mostra onde cada aluno desce.
-- ---------------------------------------------------------------------
drop function if exists public.lista_embarque(uuid);
create function public.lista_embarque(p_vdo uuid)
returns table (
  reserva_id uuid,
  aluno_id uuid,
  nome text,
  foto_path text,
  ponto_nome text,
  ponto_ordem int,
  embarcado boolean,
  tipo public.tipo_embarque,
  motivo_manual text,
  verificado_localizacao boolean,
  embarcado_em timestamptz,
  resultado public.resultado_frequencia,
  desembarque_nome text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.eh_motorista_do_onibus_dia(p_vdo) or public.eh_perfil('semtransp', 'semeduc', 'admin')) then
    raise exception 'Esta viagem não está na sua escala.' using errcode = 'P0001';
  end if;
  return query
    select r.id, r.aluno_id, u.nome, a.foto_path, p.nome, p.ordem,
           e.id is not null, e.tipo, e.motivo_manual, coalesce(e.verificado_localizacao, false), e.registrado_em,
           f.resultado, d.nome
      from public.reservas r
      join public.usuarios u on u.id = r.aluno_id
      join public.alunos a on a.usuario_id = r.aluno_id
      left join public.pontos p on p.id = r.ponto_id
      left join public.pontos d on d.id = r.ponto_desembarque_id
      left join public.embarques e on e.reserva_id = r.id
      left join public.frequencia f on f.reserva_id = r.id
     where r.viagem_dia_onibus_id = p_vdo and r.status = 'ativa'
     order by p.ordem nulls last, p.nome nulls last, u.nome;
end;
$$;

-- ---------------------------------------------------------------------
-- SEMTRANSP move todos os alunos de um ponto de embarque para outro ônibus.
-- ---------------------------------------------------------------------
create or replace function public.mover_ponto(p_viagem uuid, p_ponto uuid, p_destino uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  perform public.exigir_operacao();
  for r in
    select id from public.reservas
     where viagem_dia_id = p_viagem and status = 'ativa' and ponto_id is not distinct from p_ponto
       and viagem_dia_onibus_id is distinct from p_destino
  loop
    perform public.mover_reserva(r.id, p_destino);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.reservar(uuid, uuid, uuid), public.minhas_viagens(date), public.lista_embarque(uuid),
  public.mover_ponto(uuid, uuid, uuid), public.ponto_na_cidade(uuid, public.cidade) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.reservar(uuid, uuid, uuid), public.minhas_viagens(date),
      public.lista_embarque(uuid), public.mover_ponto(uuid, uuid, uuid), public.ponto_na_cidade(uuid, public.cidade) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.ponto_na_cidade(uuid, public.cidade) from authenticated';
    execute 'grant execute on function public.reservar(uuid, uuid, uuid), public.minhas_viagens(date),
      public.lista_embarque(uuid), public.mover_ponto(uuid, uuid, uuid) to authenticated';
  end if;
end;
$$;
