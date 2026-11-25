-- =====================================================================
-- Fase 3 — Embarque. Cole no SQL Editor do Supabase e rode UMA vez.
-- Antes: as fases 1 e 2 e os arquivos sql-editor-cpf-teste.sql e
-- sql-editor-admin-testa-aluno.sql já precisam ter sido rodados.
-- Com a extensão pg_cron ativa, a rotina de encerrar viagens esquecidas
-- (a cada 30 min) fica agendada sozinha.
-- =====================================================================

-- =====================================================================
-- Fase 3 — Embarque
-- QR code do ônibus, listas do motorista, presença manual, localização,
-- encerramento dos trechos, frequência (RN13–RN18) e viagem com ocorrência.
-- Todo horário é calculado em America/Sao_Paulo (função agora()).
-- =====================================================================

create type public.tipo_embarque as enum ('qr', 'manual');
create type public.resultado_frequencia as enum ('presente', 'falta', 'nao_retornou', 'anulada');

-- Cada ônibus inicia e encerra o próprio trecho.
alter table public.viagem_dia_onibus
  add column iniciada_em timestamptz,
  add column encerrada_em timestamptz,
  add constraint viagem_dia_onibus_encerrar_depois check (encerrada_em is null or iniciada_em is not null);

-- ---------------------------------------------------------------------
-- Embarques: um por reserva. A localização do aluno não é guardada,
-- só a distância calculada e se ela foi conferida (LGPD, seção 13).
-- ---------------------------------------------------------------------
create table public.embarques (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null unique references public.reservas (id) on delete cascade,
  viagem_dia_onibus_id uuid references public.viagem_dia_onibus (id) on delete set null,
  tipo public.tipo_embarque not null,
  motivo_manual text,
  distancia_m int,
  verificado_localizacao boolean not null default false,
  onibus_anterior_id uuid references public.viagem_dia_onibus (id) on delete set null,
  id_offline text unique,
  registrado_em timestamptz not null default now(),
  registrado_por uuid references public.usuarios (id) on delete set null,
  check (tipo = 'qr' or coalesce(trim(motivo_manual), '') <> '')
);
comment on column public.embarques.onibus_anterior_id is 'Preenchido quando o aluno leu o QR de outro ônibus da mesma viagem.';
comment on column public.embarques.id_offline is 'Identificador gerado no celular do motorista: evita duplicar a presença feita sem internet.';
create index embarques_onibus_idx on public.embarques (viagem_dia_onibus_id);

-- Resultado de cada reserva quando a viagem termina (RN14).
create table public.frequencia (
  id bigint generated always as identity primary key,
  reserva_id uuid not null unique references public.reservas (id) on delete cascade,
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  viagem_dia_id uuid not null references public.viagens_dia (id) on delete cascade,
  resultado public.resultado_frequencia not null,
  lancada_em timestamptz not null default now(),
  atualizada_em timestamptz
);
create index frequencia_aluno_idx on public.frequencia (aluno_id, lancada_em desc);
create index frequencia_viagem_idx on public.frequencia (viagem_dia_id, resultado);

-- Só a última posição do motorista em cada trecho (sem histórico do trajeto).
create table public.localizacao_motorista (
  viagem_dia_onibus_id uuid primary key references public.viagem_dia_onibus (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precisao_m int,
  registrado_em timestamptz not null
);

-- ---------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------

-- Distância em metros entre dois pontos (fórmula de haversine).
create or replace function public.distancia_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.hora_sp(p timestamptz)
returns text
language sql
stable
as $$
  select to_char(p at time zone 'America/Sao_Paulo', 'HH24:MI');
$$;

-- Motorista do trecho, SEMTRANSP ou Admin.
create or replace function public.exigir_motorista_do_trecho(p_vdo uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.eh_motorista_do_onibus_dia(p_vdo) or public.eh_perfil('semtransp', 'admin')) then
    raise exception 'Esta viagem não está na sua escala.' using errcode = 'P0001';
  end if;
end;
$$;

-- Lança a frequência das reservas ativas da viagem que ainda não têm resultado (RN14, RN16).
create or replace function public.lancar_frequencia(p_viagem uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
  n int;
begin
  select * into v from public.viagens_dia where id = p_viagem;
  insert into public.frequencia (reserva_id, aluno_id, viagem_dia_id, resultado, lancada_em)
  select r.id, r.aluno_id, r.viagem_dia_id,
         case
           when exists (select 1 from public.embarques e where e.reserva_id = r.id) then 'presente'
           when v.status = 'com_ocorrencia' then 'anulada'
           when v.sentido = 'volta' and exists (
             select 1 from public.reservas ri
               join public.viagens_dia vi on vi.id = ri.viagem_dia_id
               join public.embarques ei on ei.reserva_id = ri.id
              where ri.aluno_id = r.aluno_id and vi.data = v.data and vi.sentido = 'ida') then 'nao_retornou'
           else 'falta'
         end::public.resultado_frequencia,
         public.agora()
    from public.reservas r
   where r.viagem_dia_id = p_viagem and r.status = 'ativa'
  on conflict (reserva_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Fecha a viagem quando todos os ônibus encerraram (ou à força, na rotina automática).
create or replace function public.concluir_viagem(p_viagem uuid, p_forcar boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
begin
  select * into v from public.viagens_dia where id = p_viagem for update;
  if v.status in ('encerrada', 'cancelada') then return false; end if;

  if p_forcar then
    update public.viagem_dia_onibus
       set iniciada_em = coalesce(iniciada_em, public.agora()), encerrada_em = public.agora()
     where viagem_dia_id = p_viagem and encerrada_em is null;
  elsif exists (select 1 from public.viagem_dia_onibus where viagem_dia_id = p_viagem and encerrada_em is null) then
    return false;
  end if;

  if v.status <> 'com_ocorrencia' then
    update public.viagens_dia set status = 'encerrada' where id = p_viagem;
  end if;
  perform public.lancar_frequencia(p_viagem);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Motorista
-- ---------------------------------------------------------------------

-- Inicia o trecho do ônibus. A lista só existe depois que o prazo fecha e a alocação roda.
create or replace function public.iniciar_trecho(p_vdo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x public.viagem_dia_onibus;
  v public.viagens_dia;
begin
  perform public.exigir_motorista_do_trecho(p_vdo);
  select * into x from public.viagem_dia_onibus where id = p_vdo for update;
  if not found then raise exception 'Viagem não encontrada.' using errcode = 'P0001'; end if;
  select * into v from public.viagens_dia where id = x.viagem_dia_id for update;

  if v.status = 'cancelada' then raise exception 'Esta viagem foi cancelada.' using errcode = 'P0001'; end if;
  if v.status = 'encerrada' or x.encerrada_em is not null then
    raise exception 'Esta viagem já foi encerrada.' using errcode = 'P0001';
  end if;
  if v.status = 'agendada' then
    if v.prazo_em is not null and public.agora() < v.prazo_em then
      raise exception 'O prazo de reserva ainda está aberto (até %). A lista sai depois do prazo.', public.hora_sp(v.prazo_em)
        using errcode = 'P0001';
    end if;
    if v.prazo_em is not null then
      raise exception 'A lista está sendo fechada. Tente de novo em alguns minutos.' using errcode = 'P0001';
    end if;
  end if;
  if x.iniciada_em is not null then return; end if;

  update public.viagem_dia_onibus set iniciada_em = public.agora() where id = p_vdo;
  if v.status in ('agendada', 'prazo_fechado') then
    update public.viagens_dia set status = 'em_andamento' where id = v.id;
  end if;
end;
$$;

-- Encerra o trecho. Devolve o próximo trecho de volta do mesmo ônibus no dia (decisão 1), ou null.
create or replace function public.encerrar_trecho(p_vdo uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  x public.viagem_dia_onibus;
  v public.viagens_dia;
  v_proximo uuid;
begin
  perform public.exigir_motorista_do_trecho(p_vdo);
  select * into x from public.viagem_dia_onibus where id = p_vdo for update;
  if not found then raise exception 'Viagem não encontrada.' using errcode = 'P0001'; end if;
  if x.iniciada_em is null then raise exception 'Inicie a viagem antes de encerrar.' using errcode = 'P0001'; end if;
  select * into v from public.viagens_dia where id = x.viagem_dia_id;

  if x.encerrada_em is null then
    update public.viagem_dia_onibus set encerrada_em = public.agora() where id = p_vdo;
    delete from public.localizacao_motorista where viagem_dia_onibus_id = p_vdo;
    perform public.concluir_viagem(v.id);
  end if;

  select y.id into v_proximo
    from public.viagem_dia_onibus y
    join public.viagens_dia w on w.id = y.viagem_dia_id
   where y.onibus_id = x.onibus_id and w.data = v.data and w.sentido = 'volta'
     and w.saida_em > v.saida_em and w.status not in ('cancelada', 'encerrada')
     and y.encerrada_em is null
   order by w.saida_em
   limit 1;
  return v_proximo;
end;
$$;

-- Última posição do celular do motorista (só com o trecho em andamento).
create or replace function public.enviar_localizacao(p_vdo uuid, p_lat double precision, p_lng double precision,
                                                     p_precisao int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x public.viagem_dia_onibus;
begin
  perform public.exigir_motorista_do_trecho(p_vdo);
  select * into x from public.viagem_dia_onibus where id = p_vdo;
  if x.iniciada_em is null or x.encerrada_em is not null then
    raise exception 'A localização só é enviada com a viagem em andamento.' using errcode = 'P0001';
  end if;
  insert into public.localizacao_motorista (viagem_dia_onibus_id, lat, lng, precisao_m, registrado_em)
  values (p_vdo, p_lat, p_lng, p_precisao, public.agora())
  on conflict (viagem_dia_onibus_id) do update
    set lat = excluded.lat, lng = excluded.lng, precisao_m = excluded.precisao_m, registrado_em = excluded.registrado_em;
end;
$$;

-- Lista de embarque do ônibus, na ordem dos pontos da rota (seção 7.4).
create or replace function public.lista_embarque(p_vdo uuid)
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
  resultado public.resultado_frequencia
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
           f.resultado
      from public.reservas r
      join public.usuarios u on u.id = r.aluno_id
      join public.alunos a on a.usuario_id = r.aluno_id
      left join public.pontos p on p.id = r.ponto_id
      left join public.embarques e on e.reserva_id = r.id
      left join public.frequencia f on f.reserva_id = r.id
     where r.viagem_dia_onibus_id = p_vdo and r.status = 'ativa'
     order by p.ordem nulls last, p.nome nulls last, u.nome;
end;
$$;

-- Presença manual (RN13). Com id_offline, repetir o envio não duplica (fila sem internet).
create or replace function public.marcar_presenca_manual(p_reserva uuid, p_motivo text,
                                                         p_id_offline text default null,
                                                         p_registrado_em timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservas;
  v_id uuid;
  v_quando timestamptz;
begin
  if p_id_offline is not null then
    select id into v_id from public.embarques where id_offline = p_id_offline;
    if found then return v_id; end if;
  end if;

  select * into r from public.reservas where id = p_reserva and status = 'ativa' for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if r.viagem_dia_onibus_id is null then
    raise exception 'Este aluno ainda não foi colocado em um ônibus.' using errcode = 'P0001';
  end if;
  perform public.exigir_motorista_do_trecho(r.viagem_dia_onibus_id);
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da presença manual.' using errcode = 'P0001';
  end if;

  select id into v_id from public.embarques where reserva_id = p_reserva;
  if found then return v_id; end if;

  -- Hora informada pelo celular (fila offline), sem aceitar data no futuro.
  v_quando := least(coalesce(p_registrado_em, public.agora()), public.agora());
  insert into public.embarques (reserva_id, viagem_dia_onibus_id, tipo, motivo_manual, id_offline, registrado_em, registrado_por)
  values (p_reserva, r.viagem_dia_onibus_id, 'manual', trim(p_motivo), p_id_offline, v_quando, auth.uid())
  returning id into v_id;

  -- Se a viagem já tinha sido fechada, corrige o resultado.
  update public.frequencia set resultado = 'presente', atualizada_em = public.agora()
   where reserva_id = p_reserva and resultado <> 'presente';
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Aluno: leitura do QR code do ônibus (seção 8)
-- ---------------------------------------------------------------------
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
  if public.agora() < v.saida_em - make_interval(mins => v_antes)
     or public.agora() > v.saida_em + make_interval(mins => v_depois) then
    raise exception 'Fora do horário de embarque. Nesta viagem, o QR vale das % às %.',
      public.hora_sp(v.saida_em - make_interval(mins => v_antes)), public.hora_sp(v.saida_em + make_interval(mins => v_depois))
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

-- ---------------------------------------------------------------------
-- SEMTRANSP
-- ---------------------------------------------------------------------

-- Viagem com ocorrência (RN16): anula faltas e "não retornou" e avisa os reservados.
-- Pode ser marcada até o fim do dia seguinte ao da viagem.
create or replace function public.marcar_ocorrencia(p_viagem uuid, p_descricao text)
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
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'Descreva a ocorrência.' using errcode = 'P0001';
  end if;
  select * into v from public.viagens_dia where id = p_viagem for update;
  if not found then raise exception 'Viagem não encontrada.' using errcode = 'P0001'; end if;
  if v.status = 'cancelada' then raise exception 'Esta viagem foi cancelada.' using errcode = 'P0001'; end if;
  if v.data < public.hoje_sp() - 1 then
    raise exception 'A ocorrência só pode ser marcada até o dia seguinte ao da viagem.' using errcode = 'P0001';
  end if;

  update public.viagens_dia set status = 'com_ocorrencia', ocorrencia_descricao = trim(p_descricao) where id = p_viagem;
  update public.frequencia set resultado = 'anulada', atualizada_em = public.agora()
   where viagem_dia_id = p_viagem and resultado in ('falta', 'nao_retornou');

  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  select r.aluno_id, 'viagem_ocorrencia', 'Ocorrência na viagem: ' || v.nome,
         'A viagem das ' || public.hora_sp(v.saida_em) || ' de ' || to_char(v.data, 'DD/MM')
           || ' teve uma ocorrência: ' || trim(p_descricao) || '. Faltas desta viagem foram anuladas.',
         jsonb_build_object('viagem_dia_id', v.id)
    from public.reservas r where r.viagem_dia_id = p_viagem and r.status = 'ativa';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Rotina: encerra viagens esquecidas e lança a frequência (RN18).
create or replace function public.auto_encerrar_viagens()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_horas int := public.parametro_num('auto_encerrar_horas', 4)::int;
  n int := 0;
begin
  perform public.exigir_operacao();
  for v_id in
    select vd.id from public.viagens_dia vd
     where vd.status in ('prazo_fechado', 'em_andamento', 'com_ocorrencia')
       and vd.saida_em + make_interval(hours => v_horas) <= public.agora()
       and (vd.status <> 'com_ocorrencia'
            or exists (select 1 from public.viagem_dia_onibus x where x.viagem_dia_id = vd.id and x.encerrada_em is null)
            or exists (select 1 from public.reservas r where r.viagem_dia_id = vd.id and r.status = 'ativa'
                        and not exists (select 1 from public.frequencia f where f.reserva_id = r.id)))
     order by vd.saida_em
     for update skip locked
  loop
    delete from public.localizacao_motorista
     where viagem_dia_onibus_id in (select id from public.viagem_dia_onibus where viagem_dia_id = v_id);
    if public.concluir_viagem(v_id, true) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- minhas_viagens: agora também traz o embarque, a janela do QR e o resultado.
-- ---------------------------------------------------------------------
drop function public.minhas_viagens(date);
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
  resultado public.resultado_frequencia
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
  v_antes int := public.parametro_num('qr_janela_antes_min', 60)::int;
  v_depois int := public.parametro_num('qr_janela_depois_min', 30)::int;
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
    embarcado := r.id is not null and exists (select 1 from public.embarques e where e.reserva_id = r.id);
    embarque_de := saida_em - make_interval(mins => v_antes);
    embarque_ate := saida_em + make_interval(mins => v_depois);
    resultado := (select f.resultado from public.frequencia f where f.reserva_id = r.id);
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function public.lancar_frequencia(uuid), public.concluir_viagem(uuid, boolean),
  public.exigir_motorista_do_trecho(uuid), public.iniciar_trecho(uuid), public.encerrar_trecho(uuid),
  public.enviar_localizacao(uuid, double precision, double precision, int), public.lista_embarque(uuid),
  public.marcar_presenca_manual(uuid, text, text, timestamptz),
  public.embarcar_qr(text, double precision, double precision), public.marcar_ocorrencia(uuid, text),
  public.auto_encerrar_viagens(), public.minhas_viagens(date)
  from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.lancar_frequencia(uuid), public.concluir_viagem(uuid, boolean),
      public.exigir_motorista_do_trecho(uuid), public.iniciar_trecho(uuid), public.encerrar_trecho(uuid),
      public.enviar_localizacao(uuid, double precision, double precision, int), public.lista_embarque(uuid),
      public.marcar_presenca_manual(uuid, text, text, timestamptz),
      public.embarcar_qr(text, double precision, double precision), public.marcar_ocorrencia(uuid, text),
      public.auto_encerrar_viagens(), public.minhas_viagens(date) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.lancar_frequencia(uuid), public.concluir_viagem(uuid, boolean)
      from authenticated';
    execute 'grant execute on function public.exigir_motorista_do_trecho(uuid), public.iniciar_trecho(uuid),
      public.encerrar_trecho(uuid), public.enviar_localizacao(uuid, double precision, double precision, int),
      public.lista_embarque(uuid), public.marcar_presenca_manual(uuid, text, text, timestamptz),
      public.embarcar_qr(text, double precision, double precision), public.marcar_ocorrencia(uuid, text),
      public.auto_encerrar_viagens(), public.minhas_viagens(date) to authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS (gravação só pelas funções acima)
-- ---------------------------------------------------------------------
alter table public.embarques enable row level security;
alter table public.frequencia enable row level security;
alter table public.localizacao_motorista enable row level security;

create or replace function public.eh_minha_reserva(p_reserva uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reservas where id = p_reserva and aluno_id = auth.uid());
$$;

create policy embarques_ler on public.embarques for select
  using (
    public.eh_minha_reserva(reserva_id)
    or (viagem_dia_onibus_id is not null and public.eh_motorista_do_onibus_dia(viagem_dia_onibus_id))
    or public.eh_perfil('semtransp', 'semeduc', 'admin')
  );

create policy frequencia_ler on public.frequencia for select
  using (aluno_id = auth.uid() or public.eh_perfil('semtransp', 'semeduc', 'admin'));

create policy localizacao_ler on public.localizacao_motorista for select
  using (public.eh_motorista_do_onibus_dia(viagem_dia_onibus_id) or public.eh_perfil('semtransp', 'admin'));

-- Auditoria (seção 2): embarques e frequência. A localização não entra (muda a cada poucos segundos).
create trigger embarques_auditoria after insert or update or delete on public.embarques
  for each row execute function public.registrar_auditoria();
create trigger frequencia_auditoria after insert or update or delete on public.frequencia
  for each row execute function public.registrar_auditoria();

-- Tempo real no painel do dia.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.embarques;
  end if;
end;
$$;

-- Rotina automática: encerrar viagens esquecidas a cada 30 minutos.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('auto-encerrar-viagens', '*/30 * * * *', 'select public.auto_encerrar_viagens()');
  end if;
end;
$$;
