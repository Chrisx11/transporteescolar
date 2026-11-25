-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
-- Mudanças na viagem modelo e na escala modelo passam a valer também nas
-- viagens já geradas que ainda não aconteceram.

-- =====================================================================
-- Mudanças na viagem modelo e na escala modelo valem também para os dias
-- já gerados (substitui a decisão 17.3, a pedido, para a fase de testes).
--
-- Só mexe em viagens que ainda não aconteceram: de hoje em diante e com
-- status "agendada" ou "prazo_fechado". Viagens em andamento, encerradas,
-- canceladas ou com ocorrência ficam como estão. Reservas ATIVAS nunca são
-- apagadas: um dia que deixaria de existir mas tem reserva ativa é mantido.
-- =====================================================================

-- Gera (se faltar) e atualiza os dias de uma viagem modelo.
create or replace function public.sincronizar_viagens_do_modelo(p_modelo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.viagens_modelo;
  v public.viagens_dia;
  d date;
  v_id uuid;
  v_dias_antes int := public.parametro_num('reserva_abertura_dias_antes', 1)::int;
  v_hora_abertura time := public.parametro_texto('reserva_abertura_hora', '00:00')::time;
  v_opera boolean;
  v_prazo timestamptz;
begin
  select * into m from public.viagens_modelo where id = p_modelo;

  -- 1) Dias já gerados que ainda não aconteceram.
  for v in
    select * from public.viagens_dia
     where viagem_modelo_id = p_modelo and data >= public.hoje_sp()
       and status in ('agendada', 'prazo_fechado')
     for update
  loop
    v_opera := m.id is not null and m.ativa and not m.condicional
               and public.dia_semana_iso(v.data) = any (m.dias_semana);
    if not v_opera then
      if not exists (select 1 from public.reservas where viagem_dia_id = v.id and status = 'ativa') then
        delete from public.viagens_dia where id = v.id;
      end if;
      continue;
    end if;

    v_prazo := public.calcular_prazo(v.data, m.prazo_tipo, m.prazo_hora);
    update public.viagens_dia set
      cidade = m.cidade,
      sentido = m.sentido,
      nome = m.nome,
      saida_em = (v.data + m.hora_saida) at time zone 'America/Sao_Paulo',
      duracao_min = m.duracao_min,
      abertura_em = case when m.sentido <> 'deslocamento_vazio'
                      then ((v.data - v_dias_antes) + v_hora_abertura) at time zone 'America/Sao_Paulo' end,
      prazo_em = v_prazo,
      bloqueia_ao_lotar = m.bloqueia_ao_lotar,
      -- Prazo empurrado para o futuro: a reserva reabre.
      status = case when v.status = 'prazo_fechado' and v_prazo is not null and v_prazo > public.agora()
                 then 'agendada' else v.status end
     where id = v.id;
  end loop;

  -- 2) Dias que faltam (mesma janela da rotina: hoje até 2 dias à frente).
  if m.id is null or not m.ativa or m.condicional then return; end if;
  for d in select generate_series(public.hoje_sp(), public.hoje_sp() + 2, interval '1 day')::date loop
    continue when not (public.dia_semana_iso(d) = any (m.dias_semana));
    continue when exists (select 1 from public.calendario
                           where instituicao_id is null and data = d and tipo in ('feriado', 'recesso'));
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
      v_id := null;
    end if;
  end loop;
end;
$$;

create or replace function public.ao_mudar_viagem_modelo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sincronizar_viagens_do_modelo(new.id);
  return new;
end;
$$;

drop trigger if exists viagens_modelo_sincronizar on public.viagens_modelo;
create trigger viagens_modelo_sincronizar after insert or update on public.viagens_modelo
  for each row execute function public.ao_mudar_viagem_modelo();

-- Escala modelo mudou: refaz a escala dos dias ainda não aconteceram, naquele dia da semana.
-- Com prazo aberto, troca os ônibus da escala (mantém os extras). Com prazo já fechado,
-- só preenche quem estava sem ônibus e distribui os alunos.
create or replace function public.reaplicar_escala_modelo(p_modelo uuid, p_dia smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
begin
  for v in
    select * from public.viagens_dia
     where viagem_modelo_id = p_modelo and data >= public.hoje_sp()
       and public.dia_semana_iso(data) = p_dia
       and status in ('agendada', 'prazo_fechado')
     for update
  loop
    if v.status = 'agendada' then
      delete from public.viagem_dia_onibus where viagem_dia_id = v.id and not extra and iniciada_em is null;
      perform public.copiar_escala_para_dia(v.id);
    elsif not exists (select 1 from public.viagem_dia_onibus where viagem_dia_id = v.id) then
      perform public.copiar_escala_para_dia(v.id);
      perform public.alocar_viagem(v.id);
    end if;
  end loop;
end;
$$;

create or replace function public.ao_mudar_escala_modelo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.reaplicar_escala_modelo(old.viagem_modelo_id, old.dia_semana);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.viagem_modelo_id <> old.viagem_modelo_id or new.dia_semana <> old.dia_semana
          or new.onibus_id <> old.onibus_id or new.motorista_id is distinct from old.motorista_id) then
    perform public.reaplicar_escala_modelo(new.viagem_modelo_id, new.dia_semana);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists escala_modelo_sincronizar on public.escala_modelo;
create trigger escala_modelo_sincronizar after insert or update or delete on public.escala_modelo
  for each row execute function public.ao_mudar_escala_modelo();

-- Funções internas: só os gatilhos chamam.
revoke execute on function public.sincronizar_viagens_do_modelo(uuid), public.reaplicar_escala_modelo(uuid, smallint),
  public.ao_mudar_viagem_modelo(), public.ao_mudar_escala_modelo() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.sincronizar_viagens_do_modelo(uuid),
      public.reaplicar_escala_modelo(uuid, smallint) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.sincronizar_viagens_do_modelo(uuid),
      public.reaplicar_escala_modelo(uuid, smallint) from authenticated';
  end if;
end;
$$;

notify pgrst, 'reload schema';
