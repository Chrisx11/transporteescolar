-- Fase 4 — Volta 20:30 de Itaperuna (seção 9).
--
-- Fluxo:
--  1. Um motorista escalado em Itaperuna no dia (depois que a lista das 22:00 fecha,
--     e antes das 20:30) libera a volta 20:30: escolhe o ônibus das 22:00 que vai
--     sair mais cedo e o mínimo de vagas. O mínimo garante que os ônibus que ficam
--     para as 22:00 levem todos os que sobrarem. Só uma liberação por noite.
--  2. Só quem tem reserva na volta das 22:00 de Itaperuna pode reservar a 20:30;
--     enquanto não confirma, continua com a vaga das 22:00 e pode desistir.
--  3. Ao atingir o mínimo: confirma. Cria a viagem do dia 20:30 com aquele ônibus e
--     motorista, tira o ônibus da 22:00, passa os confirmados para a 20:30 (cancelando
--     a reserva das 22:00 deles) e redistribui quem ficou na 22:00 nos outros ônibus.
--     O QR da 20:30 vale desde a confirmação (o ônibus sai assim que todos embarcarem).
--  4. Não atingiu até as 20:30: cancela; todos continuam na 22:00, sem falta.
-- As reservas da 20:30 antes de confirmar ficam em reservas_2030 (não em reservas),
-- para não mexer nas regras das reservas normais.

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.liberacoes_2030 (
  id uuid primary key default gen_random_uuid(),
  data date not null unique, -- só uma liberação por noite
  viagem_modelo_id uuid not null references public.viagens_modelo (id) on delete cascade,
  viagem_22_id uuid not null references public.viagens_dia (id) on delete cascade,
  onibus_id uuid not null references public.onibus (id) on delete restrict,
  liberada_por uuid references public.usuarios (id) on delete set null,
  vagas_minimas int not null check (vagas_minimas > 0),
  saida_em timestamptz not null,
  status text not null default 'aberta' check (status in ('aberta', 'confirmada', 'cancelada')),
  viagem_dia_id uuid references public.viagens_dia (id) on delete set null,
  liberada_em timestamptz not null default now(),
  encerrada_em timestamptz
);
comment on table public.liberacoes_2030 is 'Volta 20:30 de Itaperuna liberada por um motorista (seção 9).';

create table if not exists public.reservas_2030 (
  id uuid primary key default gen_random_uuid(),
  liberacao_id uuid not null references public.liberacoes_2030 (id) on delete cascade,
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  status text not null default 'aguardando' check (status in ('aguardando', 'confirmada', 'cancelada', 'desistiu')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz
);
create unique index if not exists reservas_2030_uma_idx on public.reservas_2030 (liberacao_id, aluno_id)
  where status in ('aguardando', 'confirmada');

alter table public.liberacoes_2030 enable row level security;
alter table public.reservas_2030 enable row level security;
drop policy if exists liberacoes_2030_ler on public.liberacoes_2030;
create policy liberacoes_2030_ler on public.liberacoes_2030 for select to authenticated using (true);
drop policy if exists reservas_2030_ler on public.reservas_2030;
create policy reservas_2030_ler on public.reservas_2030 for select to authenticated
  using (aluno_id = auth.uid() or public.eh_perfil('semtransp', 'semeduc', 'admin'));

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'liberacoes_2030_auditoria') then
    create trigger liberacoes_2030_auditoria after insert or update or delete on public.liberacoes_2030
      for each row execute function public.registrar_auditoria();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Alocação: a confirmação da 20:30 (feita pela reserva de um aluno) precisa
-- redistribuir a 22:00 sem a checagem de permissão da SEMTRANSP.
-- ---------------------------------------------------------------------
create or replace function public.alocar_viagem_interno(p_viagem uuid)
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

create or replace function public.alocar_viagem(p_viagem uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_operacao();
  return public.alocar_viagem_interno(p_viagem);
end;
$$;

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------

-- Viagem modelo condicional de Itaperuna que opera na data (a volta 20:30).
create or replace function public.modelo_2030(p_data date)
returns public.viagens_modelo
language sql
stable
security definer
set search_path = public
as $$
  select * from public.viagens_modelo
   where cidade = 'itaperuna' and sentido = 'volta' and condicional and ativa
     and public.dia_semana_iso(p_data) = any (dias_semana)
   order by hora_saida
   limit 1;
$$;

-- Volta normal de Itaperuna logo depois da 20:30 (a das 22:00).
create or replace function public.viagem_22_do_dia(p_data date, p_saida_2030 timestamptz)
returns public.viagens_dia
language sql
stable
security definer
set search_path = public
as $$
  select vd.* from public.viagens_dia vd
    join public.viagens_modelo m on m.id = vd.viagem_modelo_id
   where vd.data = p_data and vd.cidade = 'itaperuna' and vd.sentido = 'volta' and not m.condicional
     and vd.saida_em > p_saida_2030 and vd.status <> 'cancelada'
   order by vd.saida_em
   limit 1;
$$;

-- O motorista está escalado em alguma viagem de Itaperuna no dia?
create or replace function public.escalado_em_itaperuna(p_data date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.viagem_dia_onibus x join public.viagens_dia vd on vd.id = x.viagem_dia_id
     where x.motorista_id = auth.uid() and vd.data = p_data and vd.cidade = 'itaperuna' and vd.status <> 'cancelada');
$$;

-- Início da janela do QR: na 20:30 confirmada, vale desde a confirmação.
create or replace function public.inicio_embarque(p_viagem uuid, p_antes int)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select least(vd.saida_em - make_interval(mins => p_antes),
               coalesce((select l.encerrada_em from public.liberacoes_2030 l where l.viagem_dia_id = vd.id), 'infinity'::timestamptz))
    from public.viagens_dia vd where vd.id = p_viagem;
$$;

-- ---------------------------------------------------------------------
-- Situação da noite (app do motorista e painel)
-- ---------------------------------------------------------------------
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
      'existe', true, 'pode_ver', true, 'saida_em', v_saida,
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
  elsif public.agora() >= v_saida then
    v_motivo := 'Já passou das ' || to_char(v_saida at time zone 'America/Sao_Paulo', 'HH24:MI') || '.';
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
    'pode_liberar', v_motivo is null, 'motivo', v_motivo,
    'reservas_22', v_reservas, 'capacidade_22', v_total, 'onibus', v_onibus);
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Liberação pelo motorista
-- ---------------------------------------------------------------------
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
  if public.agora() >= v_saida then
    raise exception 'Já passou do horário da volta 20:30.' using errcode = 'P0001';
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
           || ' no app. Ela confirma com ' || p_vagas || ' alunos; até lá, você continua na das 22:00.',
         jsonb_build_object('liberacao_id', v_id)
    from public.reservas r where r.viagem_dia_id = v22.id and r.status = 'ativa';
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Confirmação (ao atingir o mínimo)
-- ---------------------------------------------------------------------
create or replace function public.confirmar_volta_2030(p_liberacao uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.liberacoes_2030;
  m public.viagens_modelo;
  x22 public.viagem_dia_onibus;
  v_viagem uuid;
  v_vdo uuid;
  v_prefixo text;
  a record;
  r22 public.reservas;
begin
  select * into l from public.liberacoes_2030 where id = p_liberacao for update;
  if l.status <> 'aberta' then return l.viagem_dia_id; end if;
  select * into m from public.viagens_modelo where id = l.viagem_modelo_id;
  select * into x22 from public.viagem_dia_onibus where viagem_dia_id = l.viagem_22_id and onibus_id = l.onibus_id;
  select prefixo into v_prefixo from public.onibus where id = l.onibus_id;

  insert into public.viagens_dia (viagem_modelo_id, data, cidade, sentido, nome, saida_em, duracao_min,
                                  abertura_em, prazo_em, bloqueia_ao_lotar, status, alocada_em)
  values (m.id, l.data, 'itaperuna', 'volta', m.nome, l.saida_em, m.duracao_min,
          l.liberada_em, greatest(public.agora(), l.liberada_em + interval '1 second'), false, 'prazo_fechado', public.agora())
  returning id into v_viagem;

  -- O ônibus sai da 22:00 (quem estava nele é redistribuído abaixo) e faz a 20:30.
  delete from public.viagem_dia_onibus where id = x22.id;
  insert into public.viagem_dia_onibus (viagem_dia_id, onibus_id, motorista_id)
  values (v_viagem, l.onibus_id, x22.motorista_id)
  returning id into v_vdo;

  for a in select * from public.reservas_2030 where liberacao_id = l.id and status = 'aguardando' loop
    select * into r22 from public.reservas
     where aluno_id = a.aluno_id and viagem_dia_id = l.viagem_22_id and status = 'ativa';
    update public.reservas set status = 'cancelada', cancelada_em = public.agora()
     where aluno_id = a.aluno_id and viagem_dia_id = l.viagem_22_id and status = 'ativa';
    insert into public.reservas (aluno_id, viagem_dia_id, viagem_dia_onibus_id, ponto_id, ponto_desembarque_id, alocada_em)
    values (a.aluno_id, v_viagem, v_vdo, r22.ponto_id, r22.ponto_desembarque_id, public.agora());
    update public.reservas_2030 set status = 'confirmada', atualizada_em = public.agora() where id = a.id;
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    values (a.aluno_id, 'volta_2030_confirmada', 'Volta 20:30 confirmada! Ônibus ' || v_prefixo,
            'Vá para o ponto: o ônibus ' || v_prefixo || ' sai assim que todos embarcarem, mesmo antes das '
              || to_char(l.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') || '. Sua reserva das 22:00 foi liberada.',
            jsonb_build_object('viagem_dia_id', v_viagem));
  end loop;

  -- Quem continua na 22:00 vai para os ônibus que ficaram (avisa quem mudou de ônibus).
  perform public.alocar_viagem_interno(l.viagem_22_id);

  update public.liberacoes_2030
     set status = 'confirmada', viagem_dia_id = v_viagem, encerrada_em = public.agora()
   where id = l.id;
  return v_viagem;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Reserva e desistência do aluno
-- ---------------------------------------------------------------------
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
  if public.agora() >= l.saida_em then
    raise exception 'Já passou do horário da volta 20:30.' using errcode = 'P0001';
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
  update public.reservas_2030 set status = 'desistiu', atualizada_em = public.agora()
   where liberacao_id = l.id and aluno_id = auth.uid() and status = 'aguardando';
end;
$$;

-- Situação da 20:30 para o aluno (tela Hoje).
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
    'status', l.status, 'saida_em', l.saida_em, 'vagas', l.vagas_minimas,
    'reservados', (select count(*) from public.reservas_2030 where liberacao_id = l.id and status in ('aguardando', 'confirmada')),
    'minha', v_minha, 'na_22', v_na_22,
    'prefixo', (select prefixo from public.onibus where id = l.onibus_id),
    'viagem_dia_id', l.viagem_dia_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Rotina: cancela a 20:30 que não atingiu o mínimo até o horário
-- ---------------------------------------------------------------------
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
  for l in select * from public.liberacoes_2030 where status = 'aberta' and saida_em <= public.agora() for update skip locked loop
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

-- Leitura do QR: na 20:30 confirmada, a janela começa na confirmação.
create or replace function public.embarcar_qr(p_token text, p_lat double precision default null,
                                              p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  o public.onibus;
  r public.reservas;
  v public.viagens_dia;
  v_vdo uuid;
  v_antes int := public.parametro_num('qr_janela_antes_min', 60)::int;
  v_depois int := public.parametro_num('qr_janela_depois_min', 30)::int;
  v_dist_max int := public.parametro_num('qr_distancia_max_m', 200)::int;
  v_validade int := public.parametro_num('localizacao_motorista_validade_min', 10)::int;
  v_meu_prefixo text;
  v_ocupados int;
  v_trocou uuid;
  loc public.localizacao_motorista;
  v_dist double precision;
  v_verificado boolean := false;
  v_embarque public.embarques;
begin
  if v_aluno is null or not exists (select 1 from public.alunos where usuario_id = v_aluno) then
    raise exception 'Entre como aluno para confirmar o embarque.' using errcode = 'P0001';
  end if;

  select * into o from public.onibus where qr_token = p_token;
  if not found then raise exception 'Este QR code não é de um ônibus do sistema.' using errcode = 'P0001'; end if;

  -- Reserva do aluno, hoje, numa viagem que tem este ônibus (a mais próxima do horário atual).
  select r2.* into r
    from public.reservas r2
    join public.viagens_dia v2 on v2.id = r2.viagem_dia_id
    join public.viagem_dia_onibus x on x.viagem_dia_id = v2.id and x.onibus_id = o.id
   where r2.aluno_id = v_aluno and r2.status = 'ativa' and v2.data = public.hoje_sp()
     and v2.status not in ('cancelada', 'encerrada')
   order by abs(extract(epoch from v2.saida_em - public.agora()))
   limit 1
   for update of r2;

  if not found then
    -- Tem reserva em outra viagem neste horário? Diz qual é o ônibus dele.
    select ob.prefixo into v_meu_prefixo
      from public.reservas r2
      join public.viagens_dia v2 on v2.id = r2.viagem_dia_id
      join public.viagem_dia_onibus x on x.id = r2.viagem_dia_onibus_id
      join public.onibus ob on ob.id = x.onibus_id
     where r2.aluno_id = v_aluno and r2.status = 'ativa' and v2.data = public.hoje_sp()
       and public.agora() between v2.saida_em - make_interval(mins => v_antes) and v2.saida_em + make_interval(mins => v_depois)
     limit 1;
    if v_meu_prefixo is not null then
      raise exception 'Este ônibus não faz a sua viagem. Seu ônibus é o prefixo %.', v_meu_prefixo using errcode = 'P0001';
    end if;
    raise exception 'Você não tem reserva nesta viagem.' using errcode = 'P0001';
  end if;

  select * into v from public.viagens_dia where id = r.viagem_dia_id;
  if public.agora() < public.inicio_embarque(v.id, v_antes)
     or public.agora() > v.saida_em + make_interval(mins => v_depois) then
    raise exception 'Fora do horário de embarque. Nesta viagem, o QR vale das % às %.',
      public.hora_sp(public.inicio_embarque(v.id, v_antes)), public.hora_sp(v.saida_em + make_interval(mins => v_depois))
      using errcode = 'P0001';
  end if;

  select * into v_embarque from public.embarques where reserva_id = r.id;
  if found then
    return jsonb_build_object('ok', true, 'ja_embarcado', true, 'prefixo',
      (select ob.prefixo from public.viagem_dia_onibus x join public.onibus ob on ob.id = x.onibus_id
        where x.id = v_embarque.viagem_dia_onibus_id),
      'viagem', v.nome, 'mensagem', 'Seu embarque já estava confirmado.');
  end if;

  select x.id into v_vdo from public.viagem_dia_onibus x where x.viagem_dia_id = v.id and x.onibus_id = o.id;

  -- QR de outro ônibus da mesma viagem: aceita se houver lugar e troca a alocação.
  if r.viagem_dia_onibus_id is distinct from v_vdo then
    select count(*) into v_ocupados from public.reservas
     where viagem_dia_onibus_id = v_vdo and status = 'ativa';
    if v_ocupados >= o.capacidade then
      select ob.prefixo into v_meu_prefixo from public.viagem_dia_onibus x join public.onibus ob on ob.id = x.onibus_id
       where x.id = r.viagem_dia_onibus_id;
      if v_meu_prefixo is not null then
        raise exception 'Este ônibus está lotado. Seu ônibus é o prefixo %.', v_meu_prefixo using errcode = 'P0001';
      end if;
      raise exception 'Este ônibus está lotado.' using errcode = 'P0001';
    end if;
  end if;

  -- Localização: compara com a última posição recente do motorista deste ônibus.
  select * into loc from public.localizacao_motorista
   where viagem_dia_onibus_id = v_vdo and registrado_em >= public.agora() - make_interval(mins => v_validade);
  if found then
    if p_lat is null or p_lng is null then
      raise exception 'Permita o acesso à localização do celular para confirmar o embarque.' using errcode = 'P0001';
    end if;
    v_dist := public.distancia_m(p_lat, p_lng, loc.lat, loc.lng);
    if v_dist > v_dist_max then
      raise exception 'Você está longe do ônibus (cerca de % m). Chegue perto do ônibus e leia o QR de novo.',
        round(v_dist)::int using errcode = 'P0001';
    end if;
    v_verificado := true;
  end if;

  if r.viagem_dia_onibus_id is distinct from v_vdo then
    v_trocou := r.viagem_dia_onibus_id;
    update public.reservas set viagem_dia_onibus_id = v_vdo, alocada_em = public.agora() where id = r.id;
  end if;

  insert into public.embarques (reserva_id, viagem_dia_onibus_id, tipo, distancia_m, verificado_localizacao,
                                onibus_anterior_id, registrado_em, registrado_por)
  values (r.id, v_vdo, 'qr', round(v_dist)::int, v_verificado, v_trocou, public.agora(), v_aluno);

  update public.frequencia set resultado = 'presente', atualizada_em = public.agora()
   where reserva_id = r.id and resultado <> 'presente';

  return jsonb_build_object(
    'ok', true,
    'ja_embarcado', false,
    'prefixo', o.prefixo,
    'viagem', v.nome,
    'trocou_de_onibus', v_trocou is not null,
    'verificado_localizacao', v_verificado,
    'mensagem', case
      when v_trocou is not null then 'Embarque confirmado no ônibus ' || o.prefixo || ' (você trocou de ônibus).'
      else 'Embarque confirmado no ônibus ' || o.prefixo || '.'
    end);
end;
$$;

-- Tela do aluno: inclui as viagens em que ele tem reserva (ex.: a 20:30 confirmada) e a janela do QR da 20:30.
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
              where av.aluno_id = v_aluno and x.ativa and not x.condicional and v_dia = any (x.dias_semana)
             union
             select vd.viagem_modelo_id from public.reservas rr join public.viagens_dia vd on vd.id = rr.viagem_dia_id
              where rr.aluno_id = v_aluno and rr.status = 'ativa' and vd.data = p_data)
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
    embarque_de := coalesce(public.inicio_embarque(v.id, v_antes), saida_em - make_interval(mins => v_antes));
    embarque_ate := saida_em + make_interval(mins => v_depois);
    resultado := (select f.resultado from public.frequencia f where f.reserva_id = r.id);
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public.alocar_viagem_interno(uuid), public.confirmar_volta_2030(uuid), public.modelo_2030(date),
  public.viagem_22_do_dia(date, timestamptz), public.escalado_em_itaperuna(date), public.inicio_embarque(uuid, int),
  public.info_volta_2030(), public.liberar_volta_2030(uuid, int), public.reservar_volta_2030(), public.desistir_volta_2030(),
  public.minha_volta_2030(), public.encerrar_liberacoes_2030() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.alocar_viagem_interno(uuid), public.confirmar_volta_2030(uuid),
      public.info_volta_2030(), public.liberar_volta_2030(uuid, int), public.reservar_volta_2030(), public.desistir_volta_2030(),
      public.minha_volta_2030(), public.encerrar_liberacoes_2030(), public.inicio_embarque(uuid, int) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.info_volta_2030(), public.liberar_volta_2030(uuid, int), public.reservar_volta_2030(),
      public.desistir_volta_2030(), public.minha_volta_2030(), public.encerrar_liberacoes_2030() to authenticated';
  end if;
end;
$$;

-- Rotina: a cada 5 minutos, cancela a 20:30 que não completou o mínimo até o horário.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('encerrar-volta-2030') where exists (select 1 from cron.job where jobname = 'encerrar-volta-2030');
    perform cron.schedule('encerrar-volta-2030', '*/5 * * * *', 'select public.encerrar_liberacoes_2030()');
  end if;
end;
$$;
