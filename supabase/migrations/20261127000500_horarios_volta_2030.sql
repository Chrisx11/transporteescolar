-- Horários da volta 20:30 (pedido de 27/11/2026):
--  * o motorista libera a partir de 2 horas antes da saída (18:30) e até o fim das reservas;
--  * o aluno reserva ou desiste até 30 minutos antes da saída (20:00);
--  * sem o mínimo nesse horário (20:00), a 20:30 é cancelada e todos ficam na 22:00.
-- Os dois tempos ficam em Parâmetros.

insert into public.parametros (chave, valor, tipo, rotulo, descricao) values
  ('volta_2030_liberar_antes_min', '120', 'numero', 'Volta 20:30: liberar a partir de (min antes)',
   'Quantos minutos antes da saída o motorista pode liberar a volta 20:30 (120 = 18:30).'),
  ('volta_2030_reservas_ate_min', '30', 'numero', 'Volta 20:30: reservas até (min antes)',
   'Até quantos minutos antes da saída o aluno reserva ou desiste (30 = 20:00). Sem o mínimo nesse horário, a 20:30 é cancelada.')
on conflict (chave) do nothing;

create or replace function public.inicio_liberacao_2030(p_saida timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select p_saida - make_interval(mins => public.parametro_num('volta_2030_liberar_antes_min', 120)::int);
$$;

create or replace function public.fim_reservas_2030(p_saida timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select p_saida - make_interval(mins => public.parametro_num('volta_2030_reservas_ate_min', 30)::int);
$$;

create or replace function public.info_volta_2030()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := public.hoje_sp();
  m public.viagens_modelo;
  v22 public.viagens_dia;
  l public.liberacoes_2030;
  v_saida timestamptz;
  v_reservas int;
  v_total int;
  v_onibus jsonb;
  v_pode boolean;
  v_motivo text;
begin
  m := public.modelo_2030(v_hoje);
  if m.id is null then
    return jsonb_build_object('existe', false);
  end if;
  v_saida := (v_hoje + m.hora_saida) at time zone 'America/Sao_Paulo';
  v22 := public.viagem_22_do_dia(v_hoje, v_saida);
  v_pode := public.eh_perfil('semtransp', 'admin') or public.escalado_em_itaperuna(v_hoje);
  if not v_pode then
    return jsonb_build_object('existe', true, 'pode_ver', false);
  end if;

  select * into l from public.liberacoes_2030 where data = v_hoje;
  if found then
    return jsonb_build_object(
      'existe', true, 'pode_ver', true, 'saida_em', v_saida, 'reservas_ate', public.fim_reservas_2030(v_saida),
      'liberacao', jsonb_build_object(
        'id', l.id, 'status', l.status, 'vagas', l.vagas_minimas,
        'reservados', (select count(*) from public.reservas_2030 r where r.liberacao_id = l.id and r.status in ('aguardando', 'confirmada')),
        'prefixo', (select prefixo from public.onibus where id = l.onibus_id),
        'liberada_por', (select nome from public.usuarios where id = l.liberada_por),
        'minha', l.liberada_por = auth.uid(),
        'viagem_dia_id', l.viagem_dia_id));
  end if;

  if v22.id is null then
    v_motivo := 'Não há volta das 22:00 de Itaperuna hoje.';
  elsif public.agora() >= public.fim_reservas_2030(v_saida) then
    v_motivo := 'O horário para liberar a volta ' || to_char(v_saida at time zone 'America/Sao_Paulo', 'HH24:MI')
                || ' terminou às ' || to_char(public.fim_reservas_2030(v_saida) at time zone 'America/Sao_Paulo', 'HH24:MI') || '.';
  elsif public.agora() < public.inicio_liberacao_2030(v_saida) then
    v_motivo := 'Dá para liberar a partir das '
                || to_char(public.inicio_liberacao_2030(v_saida) at time zone 'America/Sao_Paulo', 'HH24:MI')
                || ', para ver se dará a quantidade.';
  elsif v22.status = 'agendada' then
    v_motivo := 'Dá para liberar depois que a lista das 22:00 fechar (às '
                || to_char(v22.prazo_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ').';
  elsif v22.status <> 'prazo_fechado' then
    v_motivo := 'A volta das 22:00 já começou.';
  end if;

  select count(*) into v_reservas from public.reservas where viagem_dia_id = v22.id and status = 'ativa';
  select coalesce(sum(o.capacidade), 0) into v_total
    from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id where x.viagem_dia_id = v22.id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'prefixo', o.prefixo, 'placa', o.placa, 'capacidade', o.capacidade,
           'fica', v_total - o.capacidade,
           'minimo', greatest(1, v_reservas - (v_total - o.capacidade)),
           'possivel', greatest(1, v_reservas - (v_total - o.capacidade)) <= o.capacidade)
         order by o.prefixo), '[]'::jsonb)
    into v_onibus
    from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id where x.viagem_dia_id = v22.id;

  return jsonb_build_object(
    'existe', true, 'pode_ver', true, 'saida_em', v_saida, 'liberacao', null,
    'reservas_ate', public.fim_reservas_2030(v_saida), 'liberar_de', public.inicio_liberacao_2030(v_saida),
    'pode_liberar', v_motivo is null, 'motivo', v_motivo,
    'reservas_22', v_reservas, 'capacidade_22', v_total, 'onibus', v_onibus);
end;
$$;

create or replace function public.liberar_volta_2030(p_onibus uuid, p_vagas int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := public.hoje_sp();
  m public.viagens_modelo;
  v22 public.viagens_dia;
  v_saida timestamptz;
  v_reservas int;
  v_total int;
  v_cap int;
  v_minimo int;
  v_id uuid;
  v_quem text;
begin
  if not (public.eh_perfil('admin') or (public.eh_perfil('motorista') and public.escalado_em_itaperuna(v_hoje))) then
    raise exception 'Só um motorista escalado em Itaperuna hoje pode liberar a volta 20:30.' using errcode = 'P0001';
  end if;
  m := public.modelo_2030(v_hoje);
  if m.id is null then raise exception 'Não há volta 20:30 hoje.' using errcode = 'P0001'; end if;
  v_saida := (v_hoje + m.hora_saida) at time zone 'America/Sao_Paulo';
  if public.agora() < public.inicio_liberacao_2030(v_saida) then
    raise exception 'A volta 20:30 só pode ser liberada a partir das %.', public.hora_sp(public.inicio_liberacao_2030(v_saida))
      using errcode = 'P0001';
  end if;
  if public.agora() >= public.fim_reservas_2030(v_saida) then
    raise exception 'O horário para liberar a volta 20:30 terminou às %.', public.hora_sp(public.fim_reservas_2030(v_saida))
      using errcode = 'P0001';
  end if;

  select l.id, u.nome into v_id, v_quem
    from public.liberacoes_2030 l left join public.usuarios u on u.id = l.liberada_por where l.data = v_hoje;
  if found then
    raise exception 'A volta 20:30 já foi liberada hoje%.', coalesce(' por ' || v_quem, '') using errcode = 'P0001';
  end if;

  v22 := public.viagem_22_do_dia(v_hoje, v_saida);
  if v22.id is null then raise exception 'Não há volta das 22:00 de Itaperuna hoje.' using errcode = 'P0001'; end if;
  if v22.status = 'agendada' then
    raise exception 'A volta 20:30 só pode ser liberada depois que a lista das 22:00 fechar (às %).',
      public.hora_sp(v22.prazo_em) using errcode = 'P0001';
  end if;
  if v22.status <> 'prazo_fechado' then
    raise exception 'A volta das 22:00 já começou.' using errcode = 'P0001';
  end if;

  select o.capacidade into v_cap
    from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
   where x.viagem_dia_id = v22.id and x.onibus_id = p_onibus;
  if not found then
    raise exception 'Escolha um dos ônibus da volta das 22:00.' using errcode = 'P0001';
  end if;
  select count(*) into v_reservas from public.reservas where viagem_dia_id = v22.id and status = 'ativa';
  select coalesce(sum(o.capacidade), 0) into v_total
    from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id where x.viagem_dia_id = v22.id;
  v_minimo := greatest(1, v_reservas - (v_total - v_cap));
  if v_minimo > v_cap then
    raise exception 'Com este ônibus não dá: os que ficam não levariam todos às 22:00.' using errcode = 'P0001';
  end if;
  if p_vagas is null or p_vagas < v_minimo or p_vagas > v_cap then
    raise exception 'O mínimo de vagas precisa ficar entre % e % (lugares do ônibus).', v_minimo, v_cap using errcode = 'P0001';
  end if;

  begin
    insert into public.liberacoes_2030 (data, viagem_modelo_id, viagem_22_id, onibus_id, liberada_por, vagas_minimas, saida_em, liberada_em)
    values (v_hoje, m.id, v22.id, p_onibus, auth.uid(), p_vagas, v_saida, public.agora())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A volta 20:30 já foi liberada hoje por outro motorista.' using errcode = 'P0001';
  end;

  -- Avisa quem está na 22:00 (aparece no app; notificação no celular na Fase 5).
  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  select r.aluno_id, 'volta_2030_liberada', 'Volta 20:30 liberada',
         'Quer voltar mais cedo? Reserve a volta das ' || to_char(v_saida at time zone 'America/Sao_Paulo', 'HH24:MI')
           || ' no app até as ' || public.hora_sp(public.fim_reservas_2030(v_saida)) || '. Ela confirma com ' || p_vagas
           || ' alunos; até lá, você continua na das 22:00.',
         jsonb_build_object('liberacao_id', v_id)
    from public.reservas r where r.viagem_dia_id = v22.id and r.status = 'ativa';
  return v_id;
end;
$$;

create or replace function public.reservar_volta_2030()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  l public.liberacoes_2030;
  v_qt int;
begin
  if v_aluno is null or not public.eh_perfil('aluno', 'admin') then
    raise exception 'Entre como aluno para reservar.' using errcode = 'P0001';
  end if;
  select * into l from public.liberacoes_2030 where data = public.hoje_sp() for update;
  if not found or l.status = 'cancelada' then
    raise exception 'A volta 20:30 não está liberada hoje.' using errcode = 'P0001';
  end if;
  if l.status = 'confirmada' then
    raise exception 'A volta 20:30 já fechou as vagas. Você continua na volta das 22:00.' using errcode = 'P0001';
  end if;
  if public.agora() >= public.fim_reservas_2030(l.saida_em) then
    raise exception 'As reservas da volta 20:30 fecharam às %.', public.hora_sp(public.fim_reservas_2030(l.saida_em))
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.reservas where aluno_id = v_aluno and viagem_dia_id = l.viagem_22_id and status = 'ativa') then
    raise exception 'A volta 20:30 é só para quem tem reserva na volta das 22:00 de Itaperuna.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reservas_2030 where liberacao_id = l.id and aluno_id = v_aluno and status = 'aguardando') then
    return jsonb_build_object('confirmada', false);
  end if;

  insert into public.reservas_2030 (liberacao_id, aluno_id) values (l.id, v_aluno);
  select count(*) into v_qt from public.reservas_2030 where liberacao_id = l.id and status = 'aguardando';
  if v_qt >= l.vagas_minimas then
    perform public.confirmar_volta_2030(l.id);
    return jsonb_build_object('confirmada', true);
  end if;
  return jsonb_build_object('confirmada', false, 'faltam', l.vagas_minimas - v_qt);
end;
$$;

create or replace function public.desistir_volta_2030()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.liberacoes_2030;
begin
  select * into l from public.liberacoes_2030 where data = public.hoje_sp() for update;
  if not found then return; end if;
  if l.status <> 'aberta' then
    raise exception 'A volta 20:30 já foi confirmada; não dá mais para desistir.' using errcode = 'P0001';
  end if;
  if public.agora() >= public.fim_reservas_2030(l.saida_em) then
    raise exception 'Não dá mais para desistir: as reservas da volta 20:30 fecharam às %.',
      public.hora_sp(public.fim_reservas_2030(l.saida_em)) using errcode = 'P0001';
  end if;
  update public.reservas_2030 set status = 'desistiu', atualizada_em = public.agora()
   where liberacao_id = l.id and aluno_id = auth.uid() and status = 'aguardando';
end;
$$;

create or replace function public.minha_volta_2030()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  l public.liberacoes_2030;
  v_minha text;
  v_na_22 boolean;
begin
  select * into l from public.liberacoes_2030 where data = public.hoje_sp();
  if not found then return null; end if;
  select status into v_minha from public.reservas_2030
   where liberacao_id = l.id and aluno_id = v_aluno order by criada_em desc limit 1;
  v_na_22 := exists (select 1 from public.reservas where aluno_id = v_aluno and viagem_dia_id = l.viagem_22_id and status = 'ativa');
  if v_minha is null and not v_na_22 then return null; end if;
  return jsonb_build_object(
    'status', l.status, 'saida_em', l.saida_em, 'reservas_ate', public.fim_reservas_2030(l.saida_em), 'vagas', l.vagas_minimas,
    'reservados', (select count(*) from public.reservas_2030 where liberacao_id = l.id and status in ('aguardando', 'confirmada')),
    'minha', v_minha, 'na_22', v_na_22,
    'prefixo', (select prefixo from public.onibus where id = l.onibus_id),
    'viagem_dia_id', l.viagem_dia_id);
end;
$$;

create or replace function public.encerrar_liberacoes_2030()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.liberacoes_2030;
  n int := 0;
begin
  perform public.exigir_operacao();
  for l in select * from public.liberacoes_2030 where status = 'aberta' and public.fim_reservas_2030(saida_em) <= public.agora() for update skip locked loop
    update public.liberacoes_2030 set status = 'cancelada', encerrada_em = public.agora() where id = l.id;
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    select r.aluno_id, 'volta_2030_cancelada', 'Volta 20:30 cancelada',
           'Não completou o mínimo de alunos: não haverá ônibus às '
             || to_char(l.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') || '. Você continua na volta das 22:00, sem falta.',
           jsonb_build_object('liberacao_id', l.id)
      from public.reservas_2030 r where r.liberacao_id = l.id and r.status = 'aguardando';
    update public.reservas_2030 set status = 'cancelada', atualizada_em = public.agora()
     where liberacao_id = l.id and status = 'aguardando';
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.inicio_liberacao_2030(timestamptz), public.fim_reservas_2030(timestamptz) from public;
