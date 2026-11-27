-- =====================================================================
-- Fase 5 — notificações no celular (Web Push), no lugar do WhatsApp.
--
-- Como funciona:
--  * Todo aviso continua sendo uma linha em `notificacoes` (aparece em Avisos).
--  * Ao gravar avisos, o banco chama o site (/api/push/enviar, via pg_net);
--    o site pega os pendentes e envia a notificação a cada celular inscrito.
--    Uma rotina a cada minuto repete a chamada se algo ficou para trás.
--  * Cada celular que aceitou receber fica em `push_inscricoes`.
--
-- Avisos novos:
--  * "Ônibus no ponto": o primeiro aluno de um ponto que embarca avisa quem
--    está naquele ônibus e ainda não embarcou (uma vez por ponto e ônibus).
--  * Lembrete de reserva (1 h antes do prazo, parâmetro), no máximo um de ida
--    e um de volta por aluno e dia; o aluno pode desligar.
--  * Matrícula vencendo (15 dias antes) e vencida.
--  * Motorista: escalado ou retirado de uma viagem de hoje/amanhã, lista
--    fechada (quantos alunos no ônibus dele) e viagem cancelada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração privada (só o servidor lê): endereço do site, segredo da
-- chamada do banco e as chaves VAPID (geradas pelo site no primeiro envio).
-- ---------------------------------------------------------------------
create table if not exists public.config_privada (
  chave text primary key,
  valor text not null
);
alter table public.config_privada enable row level security;
revoke all on public.config_privada from anon, authenticated;

insert into public.config_privada (chave, valor) values
  ('site_url', 'https://transporteescolar-phi.vercel.app'),
  ('push_segredo', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Celulares inscritos
-- ---------------------------------------------------------------------
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultimo_envio_em timestamptz
);
create index if not exists push_inscricoes_usuario_idx on public.push_inscricoes (usuario_id);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_inscricoes_proprias on public.push_inscricoes;
create policy push_inscricoes_proprias on public.push_inscricoes for select
  using (usuario_id = auth.uid());

-- O aluno pode desligar os lembretes (os avisos operacionais não).
alter table public.usuarios add column if not exists receber_lembretes boolean not null default true;

-- Lembrete: 1 hora antes do prazo (o parâmetro já existia com 120).
update public.parametros
   set valor = '60', rotulo = 'Lembrete de reserva: minutos antes do prazo',
       descricao = 'Com quanta antecedência do prazo o aluno que ainda não reservou recebe o lembrete (60 = 1 hora).'
 where chave = 'lembrete_reserva_minutos_antes' and valor = '120'::jsonb;

-- Envio já feito por viagem (lembrete) e por ponto (ônibus no ponto).
alter table public.viagens_dia add column if not exists lembrete_em timestamptz;
create table if not exists public.avisos_ponto (
  viagem_dia_onibus_id uuid not null references public.viagem_dia_onibus (id) on delete cascade,
  ponto_id uuid not null references public.pontos (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (viagem_dia_onibus_id, ponto_id)
);
alter table public.avisos_ponto enable row level security;

-- ---------------------------------------------------------------------
-- Chamada ao site para enviar os pendentes (nunca atrapalha quem gravou).
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível: as notificações ficam só em Avisos até ativar a extensão.';
end;
$$;

create or replace function public.chamar_envio_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_segredo text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  select valor into v_url from public.config_privada where chave = 'site_url';
  select valor into v_segredo from public.config_privada where chave = 'push_segredo';
  if v_url is null or v_segredo is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 10000)'
    using v_url || '/api/push/enviar',
          jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_segredo);
exception when others then
  raise notice 'Envio de push não agendado: %', sqlerrm;
end;
$$;
revoke all on function public.chamar_envio_push() from public, anon, authenticated;

create or replace function public.ao_gravar_notificacoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.chamar_envio_push();
  return null;
end;
$$;
drop trigger if exists notificacoes_enviar_push on public.notificacoes;
create trigger notificacoes_enviar_push
  after insert on public.notificacoes
  for each statement execute function public.ao_gravar_notificacoes();

-- O site pega os pendentes de uma vez (sem enviar duas vezes o mesmo aviso).
create or replace function public.pegar_notificacoes_push(p_limite int default 300)
returns table (id bigint, usuario_id uuid, evento text, titulo text, conteudo text, referencia jsonb, perfil public.perfil)
language sql
security definer
set search_path = public
as $$
  with escolhidas as (
    select n.id from public.notificacoes n
     where n.status = 'pendente' and n.criado_em > now() - interval '3 hours'
     order by n.id
     limit p_limite
     for update skip locked
  )
  update public.notificacoes n
     set status = 'enviada', canal = 'push', enviado_em = now()
    from escolhidas e, public.usuarios u
   where n.id = e.id and u.id = n.usuario_id
  returning n.id, n.usuario_id, n.evento, n.titulo, n.conteudo, n.referencia, u.perfil;
$$;
revoke all on function public.pegar_notificacoes_push(int) from public, anon, authenticated;
grant execute on function public.pegar_notificacoes_push(int) to service_role;

-- Rede de segurança: a cada minuto, se ficou aviso pendente recente, chama de novo.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('enviar-push', '* * * * *',
      $c$select public.chamar_envio_push() where exists (
           select 1 from public.notificacoes
            where status = 'pendente' and criado_em between now() - interval '3 hours' and now() - interval '30 seconds')$c$);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Ônibus no ponto: o primeiro embarque de cada ponto avisa quem está no
-- ônibus e ainda não embarcou (do mesmo ponto em diante na rota).
-- ---------------------------------------------------------------------
create or replace function public.avisar_onibus_no_ponto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservas;
  x public.viagem_dia_onibus;
  p public.pontos;
  v_prefixo text;
begin
  select * into r from public.reservas where id = new.reserva_id;
  if not found or r.ponto_id is null then return null; end if;
  select * into x from public.viagem_dia_onibus where id = coalesce(new.viagem_dia_onibus_id, r.viagem_dia_onibus_id);
  -- Só com o ônibus rodando (presença lançada depois do fim não avisa ninguém).
  if not found or x.iniciada_em is null or x.encerrada_em is not null then return null; end if;

  insert into public.avisos_ponto (viagem_dia_onibus_id, ponto_id) values (x.id, r.ponto_id)
  on conflict do nothing;
  if not found then return null; end if;

  select * into p from public.pontos where id = r.ponto_id;
  select prefixo into v_prefixo from public.onibus where id = x.onibus_id;

  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  select o.aluno_id, 'onibus_no_ponto',
         'Ônibus ' || v_prefixo || ' no ponto ' || p.nome,
         case when o.ponto_id = r.ponto_id
              then 'O ônibus chegou ao seu ponto. Embarque e leia o QR code.'
              else 'O ônibus está a caminho do seu ponto (' || coalesce(po.nome, 'seu ponto') || '). Fique pronto!' end,
         jsonb_build_object('viagem_dia_id', r.viagem_dia_id, 'ponto_id', r.ponto_id, 'onibus', v_prefixo)
    from public.reservas o
    left join public.pontos po on po.id = o.ponto_id
   where o.viagem_dia_onibus_id = x.id
     and o.status = 'ativa'
     and o.id <> r.id
     and not exists (select 1 from public.embarques e where e.reserva_id = o.id)
     and (o.ponto_id = r.ponto_id or po.ordem is null or p.ordem is null or po.ordem >= p.ordem);
  return null;
end;
$$;
drop trigger if exists embarques_avisar_ponto on public.embarques;
create trigger embarques_avisar_ponto
  after insert on public.embarques
  for each row execute function public.avisar_onibus_no_ponto();

-- ---------------------------------------------------------------------
-- Lembrete de reserva (rotina a cada 5 min).
-- ---------------------------------------------------------------------
create or replace function public.lembrar_reservas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
  v_total int := 0;
  v_n int;
  v_min numeric := public.parametro_num('lembrete_reserva_minutos_antes', 60);
begin
  if coalesce((select valor #>> '{}' from public.parametros where chave = 'lembrete_reserva_ativo'), 'true') <> 'true' then
    return 0;
  end if;
  for v in
    select * from public.viagens_dia d
     where d.status = 'agendada' and d.sentido in ('ida', 'volta') and d.lembrete_em is null
       and public.agora() >= d.prazo_em - make_interval(mins => v_min::int)
       and public.agora() < d.prazo_em
       and public.agora() >= d.abertura_em
     order by d.prazo_em
  loop
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    select a.usuario_id, 'lembrete_reserva',
           'Reserve sua ' || case when v.sentido = 'ida' then 'ida' else 'volta' end || ' até as ' || to_char(v.prazo_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
           v.nome || ' sai às ' || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI')
             || case when v.data = (public.agora() at time zone 'America/Sao_Paulo')::date then ' de hoje' else ' de amanhã' end
             || '. Depois do prazo não dá mais para reservar.',
           jsonb_build_object('viagem_dia_id', v.id, 'data', v.data, 'sentido', v.sentido)
      from public.alunos a
      join public.usuarios u on u.id = a.usuario_id
     where u.ativo and u.receber_lembretes and a.situacao = 'ativo'
       and (exists (select 1 from public.aluno_viagens av where av.aluno_id = a.usuario_id and av.viagem_modelo_id = v.viagem_modelo_id)
            or exists (select 1 from public.grade_semanal g
                        where g.aluno_id = a.usuario_id and g.dia_semana = public.dia_semana_iso(v.data)
                          and v.viagem_modelo_id = case when v.sentido = 'ida' then g.viagem_ida_modelo_id else g.viagem_volta_modelo_id end))
       and public.motivo_bloqueio(a.usuario_id, v.id) is null
       -- Já tem reserva nesse sentido no dia: não lembra.
       and not exists (select 1 from public.reservas r join public.viagens_dia d on d.id = r.viagem_dia_id
                        where r.aluno_id = a.usuario_id and r.status = 'ativa' and d.data = v.data and d.sentido = v.sentido)
       -- Volta que sai antes da ida reservada não serve.
       and not (v.sentido = 'volta' and exists (
             select 1 from public.reservas r join public.viagens_dia d on d.id = r.viagem_dia_id
              where r.aluno_id = a.usuario_id and r.status = 'ativa' and d.data = v.data and d.sentido = 'ida' and d.saida_em >= v.saida_em))
       -- No máximo um lembrete de ida e um de volta por dia.
       and not exists (select 1 from public.notificacoes n
                        where n.usuario_id = a.usuario_id and n.evento = 'lembrete_reserva'
                          and n.referencia ->> 'data' = v.data::text and n.referencia ->> 'sentido' = v.sentido::text);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    update public.viagens_dia set lembrete_em = public.agora() where id = v.id;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.lembrar_reservas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Matrícula vencendo (15 dias antes) e vencida (rotina diária, 08:00).
-- ---------------------------------------------------------------------
create or replace function public.avisar_matriculas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := public.hoje_sp();
  v_n int;
  v_m int;
begin
  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  select a.usuario_id, 'matricula_vencendo', 'Sua matrícula vence em 15 dias',
         'O comprovante de matrícula vale até ' || to_char(a.matricula_validade, 'DD/MM/YYYY')
           || '. Leve o novo comprovante à Secretaria de Educação para continuar reservando.',
         jsonb_build_object('validade', a.matricula_validade)
    from public.alunos a join public.usuarios u on u.id = a.usuario_id
   where u.ativo and a.situacao = 'ativo' and a.matricula_validade = v_hoje + 15;
  get diagnostics v_n = row_count;

  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  select a.usuario_id, 'matricula_vencida', 'Sua matrícula venceu',
         'Até renovar o comprovante de matrícula na Secretaria de Educação, você não consegue reservar viagens.',
         jsonb_build_object('validade', a.matricula_validade)
    from public.alunos a join public.usuarios u on u.id = a.usuario_id
   where u.ativo and a.situacao = 'ativo' and a.matricula_validade = v_hoje - 1;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end;
$$;
revoke all on function public.avisar_matriculas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Motorista: escalado / retirado (viagens de hoje e amanhã ainda não iniciadas).
-- A geração automática cria os dias com 2 dias de antecedência, então não avisa.
-- A volta 20:30 avisa pela "lista fechada".
-- ---------------------------------------------------------------------
create or replace function public.texto_viagem(v public.viagens_dia)
returns text
language sql
stable
set search_path = public
as $$
  select v.nome || ' · ' || case v.cidade when 'campos' then 'Campos' else 'Itaperuna' end || ' · '
         || case when v.data = public.hoje_sp() then 'hoje' when v.data = public.hoje_sp() + 1 then 'amanhã'
                 else to_char(v.data, 'DD/MM') end
         || ' às ' || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI');
$$;

-- Quem já sabe que faz cada viagem (evita avisar de novo quando a escala é
-- reaplicada: as linhas são apagadas e recriadas iguais).
create table if not exists public.escala_avisada (
  viagem_dia_id uuid not null references public.viagens_dia (id) on delete cascade,
  motorista_id uuid not null references public.motoristas (usuario_id) on delete cascade,
  primary key (viagem_dia_id, motorista_id)
);
alter table public.escala_avisada enable row level security;
insert into public.escala_avisada (viagem_dia_id, motorista_id)
select distinct x.viagem_dia_id, x.motorista_id
  from public.viagem_dia_onibus x join public.viagens_dia v on v.id = x.viagem_dia_id
 where x.motorista_id is not null and v.data >= current_date - 1
on conflict do nothing;

-- Roda no fim da transação, olhando como a escala ficou.
create or replace function public.avisar_escala_motorista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
  v_silencioso boolean;
  v_prefixo text;
begin
  select * into v from public.viagens_dia where id = coalesce(new.viagem_dia_id, old.viagem_dia_id);
  if not found then return null; end if;
  -- Silencioso: fora de hoje/amanhã, viagem já iniciada, volta 20:30 ou viagem criada agora (geração).
  v_silencioso := v.data not between public.hoje_sp() and public.hoje_sp() + 1
     or v.criada_em = now()
     or v.status not in ('agendada', 'prazo_fechado')
     or exists (select 1 from public.viagens_modelo m where m.id = v.viagem_modelo_id and m.condicional);

  if tg_op in ('INSERT', 'UPDATE') and new.motorista_id is not null then
    select o.prefixo into v_prefixo
      from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
     where x.viagem_dia_id = v.id and x.motorista_id = new.motorista_id
     limit 1;
    if found then
      insert into public.escala_avisada (viagem_dia_id, motorista_id) values (v.id, new.motorista_id)
      on conflict do nothing;
      if found and not v_silencioso then
        insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
        values (new.motorista_id, 'motorista_escalado', 'Você foi escalado: ônibus ' || v_prefixo,
                public.texto_viagem(v) || '.', jsonb_build_object('viagem_dia_id', v.id, 'onibus', v_prefixo));
      end if;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.motorista_id is not null
     and not exists (select 1 from public.viagem_dia_onibus where viagem_dia_id = v.id and motorista_id = old.motorista_id) then
    delete from public.escala_avisada where viagem_dia_id = v.id and motorista_id = old.motorista_id;
    if found and not v_silencioso then
      insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
      values (old.motorista_id, 'motorista_retirado', 'Você não está mais numa viagem',
              public.texto_viagem(v) || ': você saiu da escala desta viagem.', jsonb_build_object('viagem_dia_id', v.id));
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists viagem_dia_onibus_avisar_motorista on public.viagem_dia_onibus;
create constraint trigger viagem_dia_onibus_avisar_motorista
  after insert or update of motorista_id, onibus_id or delete on public.viagem_dia_onibus
  deferrable initially deferred
  for each row execute function public.avisar_escala_motorista();

-- ---------------------------------------------------------------------
-- Motorista: lista fechada (no fim da transação, depois da alocação) e
-- viagem cancelada.
-- ---------------------------------------------------------------------
create or replace function public.avisar_status_motorista()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens_dia;
begin
  select * into v from public.viagens_dia where id = new.id;
  if not found then return null; end if;

  if v.status = 'prazo_fechado' and (tg_op = 'INSERT' or old.status is distinct from 'prazo_fechado') then
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    select x.motorista_id, 'lista_fechada',
           'Lista fechada: ' || (select count(*) from public.reservas r where r.viagem_dia_onibus_id = x.id and r.status = 'ativa')
             || ' alunos no ônibus ' || o.prefixo,
           public.texto_viagem(v) || '. Abra o app para ver a lista por ponto.',
           jsonb_build_object('viagem_dia_id', v.id, 'onibus', o.prefixo)
      from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
     where x.viagem_dia_id = v.id and x.motorista_id is not null;
  elsif v.status = 'cancelada' and tg_op = 'UPDATE' and old.status is distinct from 'cancelada' then
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    select x.motorista_id, 'viagem_cancelada', 'Viagem cancelada',
           public.texto_viagem(v) || ' foi cancelada.' || coalesce(' Motivo: ' || v.ocorrencia_descricao, ''),
           jsonb_build_object('viagem_dia_id', v.id)
      from public.viagem_dia_onibus x
     where x.viagem_dia_id = v.id and x.motorista_id is not null;
  end if;
  return null;
end;
$$;
drop trigger if exists viagens_dia_avisar_motorista on public.viagens_dia;
create constraint trigger viagens_dia_avisar_motorista
  after insert or update of status on public.viagens_dia
  deferrable initially deferred
  for each row execute function public.avisar_status_motorista();

-- ---------------------------------------------------------------------
-- Rotinas
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('lembrar-reservas', '*/5 * * * *', 'select public.lembrar_reservas()');
    -- 11:00 UTC = 08:00 em São Paulo.
    perform cron.schedule('avisar-matriculas', '0 11 * * *', 'select public.avisar_matriculas()');
  end if;
end;
$$;
