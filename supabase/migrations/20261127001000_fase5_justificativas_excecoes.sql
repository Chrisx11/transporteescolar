-- =====================================================================
-- Fase 5 (final): justificativa de falta (RN17) e exceção de data (RN19).
--
--  * Justificativa: o aluno explica uma falta (com anexo opcional, ex.:
--    atestado) até N dias depois da viagem; a SEMEDUC aprova (a falta vira
--    "justificada") ou recusa com resposta.
--  * Exceção: o aluno pede outra ida e/ou volta para uma data (ex.: prova em
--    outro turno); aprovada, no sentido pedido só vale a viagem da exceção,
--    e só naquela data.
--  * O aluno é avisado (notificação) da análise.
-- =====================================================================

alter type public.resultado_frequencia add value if not exists 'justificada';

do $$
begin
  create type public.status_analise as enum ('pendente', 'aprovada', 'recusada', 'cancelada');
exception when duplicate_object then null;
end;
$$;

insert into public.parametros (chave, valor, tipo, rotulo, descricao) values
  ('justificativa_prazo_dias', '15', 'numero', 'Justificativa de falta: prazo (dias)',
   'Até quantos dias depois da viagem o aluno pode enviar a justificativa da falta.'),
  ('excecao_antecedencia_max_dias', '60', 'numero', 'Troca de horário: até quantos dias à frente',
   'O aluno pode pedir troca de horário (exceção) para datas de hoje até este número de dias à frente.')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.justificativas (
  id uuid primary key default gen_random_uuid(),
  frequencia_id bigint not null references public.frequencia (id) on delete cascade,
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  motivo text not null,
  anexo_path text,
  status public.status_analise not null default 'pendente',
  resposta text,
  analisado_por uuid references public.usuarios (id) on delete set null,
  analisado_em timestamptz,
  criado_em timestamptz not null default now()
);
create unique index if not exists justificativas_uma_ativa_idx on public.justificativas (frequencia_id)
  where status in ('pendente', 'aprovada');
create index if not exists justificativas_status_idx on public.justificativas (status, criado_em);
create index if not exists justificativas_aluno_idx on public.justificativas (aluno_id, criado_em desc);

create table if not exists public.excecoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  data date not null,
  viagem_ida_modelo_id uuid references public.viagens_modelo (id) on delete cascade,
  viagem_volta_modelo_id uuid references public.viagens_modelo (id) on delete cascade,
  motivo text not null,
  status public.status_analise not null default 'pendente',
  resposta text,
  analisado_por uuid references public.usuarios (id) on delete set null,
  analisado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (viagem_ida_modelo_id is not null or viagem_volta_modelo_id is not null)
);
create unique index if not exists excecoes_uma_por_dia_idx on public.excecoes (aluno_id, data)
  where status in ('pendente', 'aprovada');
create index if not exists excecoes_status_idx on public.excecoes (status, data);

alter table public.justificativas enable row level security;
alter table public.excecoes enable row level security;
drop policy if exists justificativas_ler on public.justificativas;
create policy justificativas_ler on public.justificativas for select
  using (aluno_id = auth.uid() or public.eh_perfil('semeduc', 'semtransp', 'admin'));
drop policy if exists excecoes_ler on public.excecoes;
create policy excecoes_ler on public.excecoes for select
  using (aluno_id = auth.uid() or public.eh_perfil('semeduc', 'semtransp', 'admin'));

-- ---------------------------------------------------------------------
-- Justificativa de falta
-- ---------------------------------------------------------------------
create or replace function public.enviar_justificativa(p_frequencia bigint, p_motivo text, p_anexo text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  f public.frequencia;
  v_data date;
  v_prazo int := public.parametro_num('justificativa_prazo_dias', 15)::int;
  v_id uuid;
begin
  if v_aluno is null or not public.eh_perfil('aluno') then
    raise exception 'Entre como aluno para justificar a falta.' using errcode = 'P0001';
  end if;
  select * into f from public.frequencia where id = p_frequencia and aluno_id = v_aluno;
  if not found then raise exception 'Falta não encontrada.' using errcode = 'P0001'; end if;
  if f.resultado::text <> 'falta' then raise exception 'Só dá para justificar faltas.' using errcode = 'P0001'; end if;
  select data into v_data from public.viagens_dia where id = f.viagem_dia_id;
  if v_data < public.hoje_sp() - v_prazo then
    raise exception 'O prazo para justificar esta falta (% dias depois da viagem) já acabou.', v_prazo using errcode = 'P0001';
  end if;
  if exists (select 1 from public.justificativas where frequencia_id = f.id and status in ('pendente', 'aprovada')) then
    raise exception 'Esta falta já tem uma justificativa enviada.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explique o motivo da falta.' using errcode = 'P0001';
  end if;
  if p_anexo is not null and (p_anexo not like v_aluno::text || '/justificativa-%' or p_anexo like '%..%') then
    raise exception 'Anexo inválido.' using errcode = 'P0001';
  end if;
  insert into public.justificativas (frequencia_id, aluno_id, motivo, anexo_path)
  values (f.id, v_aluno, trim(p_motivo), p_anexo)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.analisar_justificativa(p_id uuid, p_aprovar boolean, p_resposta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.justificativas;
  v public.viagens_dia;
begin
  if not public.eh_perfil('semeduc') then
    raise exception 'Só a Secretaria de Educação analisa justificativas.' using errcode = 'P0001';
  end if;
  select * into j from public.justificativas where id = p_id for update;
  if not found then raise exception 'Justificativa não encontrada.' using errcode = 'P0001'; end if;
  if j.status <> 'pendente' then raise exception 'Esta justificativa já foi analisada.' using errcode = 'P0001'; end if;
  if not p_aprovar and length(trim(coalesce(p_resposta, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'P0001';
  end if;

  update public.justificativas
     set status = case when p_aprovar then 'aprovada'::public.status_analise else 'recusada'::public.status_analise end,
         resposta = nullif(trim(coalesce(p_resposta, '')), ''),
         analisado_por = auth.uid(), analisado_em = now()
   where id = p_id;
  if p_aprovar then
    update public.frequencia set resultado = 'justificada'::public.resultado_frequencia, atualizada_em = now()
     where id = j.frequencia_id and resultado::text = 'falta';
  end if;

  select d.* into v from public.frequencia f join public.viagens_dia d on d.id = f.viagem_dia_id where f.id = j.frequencia_id;
  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  values (j.aluno_id,
          case when p_aprovar then 'justificativa_aprovada' else 'justificativa_recusada' end,
          case when p_aprovar then 'Falta justificada' else 'Justificativa recusada' end,
          v.nome || ' de ' || to_char(v.data, 'DD/MM') ||
            case when p_aprovar then ': a Secretaria de Educação aceitou sua justificativa.'
                 else ': a justificativa não foi aceita. Motivo: ' || trim(p_resposta) end,
          jsonb_build_object('justificativa_id', j.id, 'viagem_dia_id', v.id));
end;
$$;

-- ---------------------------------------------------------------------
-- Exceção de data (troca de horário)
-- ---------------------------------------------------------------------
create or replace function public.pedir_excecao(p_data date, p_ida uuid, p_volta uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  a public.alunos;
  i public.viagens_modelo;
  vo public.viagens_modelo;
  v_dia smallint := public.dia_semana_iso(p_data);
  v_max int := public.parametro_num('excecao_antecedencia_max_dias', 60)::int;
  v_id uuid;
begin
  if v_aluno is null or not public.eh_perfil('aluno') then
    raise exception 'Entre como aluno para pedir a troca de horário.' using errcode = 'P0001';
  end if;
  select * into a from public.alunos where usuario_id = v_aluno;
  if not found or a.situacao <> 'ativo' then
    raise exception 'Seu cadastro precisa estar ativo para pedir troca de horário.' using errcode = 'P0001';
  end if;
  if p_data is null or p_data < public.hoje_sp() then
    raise exception 'Escolha uma data de hoje em diante.' using errcode = 'P0001';
  end if;
  if p_data > public.hoje_sp() + v_max then
    raise exception 'Só dá para pedir com até % dias de antecedência.', v_max using errcode = 'P0001';
  end if;
  if p_ida is null and p_volta is null then
    raise exception 'Escolha a ida, a volta ou as duas.' using errcode = 'P0001';
  end if;
  if p_ida is not null then
    select * into i from public.viagens_modelo where id = p_ida and sentido = 'ida' and ativa and not condicional;
    if not found then raise exception 'Ida inválida.' using errcode = 'P0001'; end if;
    if not v_dia = any (i.dias_semana) then
      raise exception 'A ida escolhida não acontece nesse dia da semana.' using errcode = 'P0001';
    end if;
  end if;
  if p_volta is not null then
    select * into vo from public.viagens_modelo where id = p_volta and sentido = 'volta' and ativa and not condicional;
    if not found then raise exception 'Volta inválida.' using errcode = 'P0001'; end if;
    if not v_dia = any (vo.dias_semana) then
      raise exception 'A volta escolhida não acontece nesse dia da semana.' using errcode = 'P0001';
    end if;
  end if;
  if p_ida is not null and p_volta is not null then
    if i.cidade <> vo.cidade then
      raise exception 'A ida e a volta precisam ser da mesma cidade.' using errcode = 'P0001';
    end if;
    if vo.hora_saida <= i.hora_saida then
      raise exception 'A volta precisa sair depois da ida.' using errcode = 'P0001';
    end if;
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explique o motivo do pedido (ex.: prova no turno da manhã).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.excecoes where aluno_id = v_aluno and data = p_data and status in ('pendente', 'aprovada')) then
    raise exception 'Você já tem um pedido para esta data. Desista dele para pedir outro.' using errcode = 'P0001';
  end if;
  insert into public.excecoes (aluno_id, data, viagem_ida_modelo_id, viagem_volta_modelo_id, motivo)
  values (v_aluno, p_data, p_ida, p_volta, trim(p_motivo))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.desistir_excecao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x public.excecoes;
begin
  select * into x from public.excecoes where id = p_id and aluno_id = auth.uid() for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if x.status not in ('pendente', 'aprovada') or x.data < public.hoje_sp() then
    raise exception 'Este pedido não pode mais ser cancelado.' using errcode = 'P0001';
  end if;
  update public.excecoes set status = 'cancelada' where id = p_id;
end;
$$;

create or replace function public.analisar_excecao(p_id uuid, p_aprovar boolean, p_resposta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x public.excecoes;
begin
  if not public.eh_perfil('semeduc') then
    raise exception 'Só a Secretaria de Educação analisa os pedidos.' using errcode = 'P0001';
  end if;
  select * into x from public.excecoes where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if x.status <> 'pendente' then raise exception 'Este pedido já foi analisado.' using errcode = 'P0001'; end if;
  if p_aprovar and x.data < public.hoje_sp() then
    raise exception 'A data deste pedido já passou.' using errcode = 'P0001';
  end if;
  if not p_aprovar and length(trim(coalesce(p_resposta, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'P0001';
  end if;
  update public.excecoes
     set status = case when p_aprovar then 'aprovada'::public.status_analise else 'recusada'::public.status_analise end,
         resposta = nullif(trim(coalesce(p_resposta, '')), ''),
         analisado_por = auth.uid(), analisado_em = now()
   where id = p_id;
  insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
  values (x.aluno_id,
          case when p_aprovar then 'excecao_aprovada' else 'excecao_recusada' end,
          case when p_aprovar then 'Troca de horário aprovada' else 'Troca de horário recusada' end,
          'Dia ' || to_char(x.data, 'DD/MM') ||
            case when p_aprovar then ': a viagem pedida já aparece no app para você reservar dentro do prazo.'
                 else ': o pedido não foi aceito. Motivo: ' || trim(p_resposta) end,
          jsonb_build_object('excecao_id', x.id, 'data', x.data));
end;
$$;

-- ---------------------------------------------------------------------
-- Histórico do aluno (reservas com resultado e justificativa)
-- ---------------------------------------------------------------------
create or replace function public.meu_historico(p_dias int default 90)
returns table (
  reserva_id uuid,
  data date,
  nome text,
  cidade public.cidade,
  sentido public.sentido,
  saida_em timestamptz,
  status_viagem public.status_viagem,
  embarcado boolean,
  frequencia_id bigint,
  resultado text,
  justificativa_status public.status_analise,
  justificativa_resposta text,
  pode_justificar boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, v.data, v.nome, v.cidade, v.sentido, v.saida_em, v.status,
         exists (select 1 from public.embarques e where e.reserva_id = r.id),
         f.id, f.resultado::text, j.status, j.resposta,
         coalesce(f.resultado::text = 'falta', false)
           and v.data >= public.hoje_sp() - public.parametro_num('justificativa_prazo_dias', 15)::int
           and not exists (select 1 from public.justificativas x where x.frequencia_id = f.id and x.status in ('pendente', 'aprovada'))
    from public.reservas r
    join public.viagens_dia v on v.id = r.viagem_dia_id
    left join public.frequencia f on f.reserva_id = r.id
    left join lateral (
      select x.status, x.resposta from public.justificativas x
       where x.frequencia_id = f.id order by x.criado_em desc limit 1
    ) j on true
   where r.aluno_id = auth.uid()
     and v.data >= public.hoje_sp() - least(greatest(p_dias, 1), 400)
     and v.data <= public.hoje_sp()
     and (f.id is not null or (r.status = 'ativa' and v.status not in ('cancelada')))
   order by v.saida_em desc;
$$;

-- ---------------------------------------------------------------------
-- Regras da reserva e tela do aluno passam a considerar a exceção aprovada.
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
  v_na_grade boolean;
  v_na_rota boolean;
  v_instituicao uuid;
  v_capacidade int;
  v_reservas int;
  ex public.excecoes;
  v_exc uuid;
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
  v_na_grade := found and v.viagem_modelo_id is not distinct from
       (case when v.sentido = 'ida' then g.viagem_ida_modelo_id else g.viagem_volta_modelo_id end);
  v_na_rota := exists (select 1 from public.aluno_viagens where aluno_id = p_aluno and viagem_modelo_id = v.viagem_modelo_id);
  -- Exceção aprovada para a data: no sentido dela, só vale a viagem da exceção (RN19).
  select * into ex from public.excecoes where aluno_id = p_aluno and data = v.data and status = 'aprovada';
  if found then
    v_exc := case when v.sentido = 'ida' then ex.viagem_ida_modelo_id else ex.viagem_volta_modelo_id end;
    if v_exc is not null then
      if v.viagem_modelo_id <> v_exc then return 'fora_da_grade'; end if;
      v_na_rota := true;
      v_na_grade := false;
    end if;
  end if;
  if not (v_na_grade or v_na_rota) then return 'fora_da_grade'; end if;

  if exists (select 1 from public.calendario
              where instituicao_id is null and data = v.data and tipo in ('feriado', 'recesso')) then
    return 'sem_operacao';
  end if;

  v_instituicao := case when v_na_grade and g.instituicao_id is not null then g.instituicao_id
                        else public.instituicao_do_aluno(p_aluno, v.cidade) end;
  if v_instituicao is not null then
    if exists (select 1 from public.calendario where instituicao_id = v_instituicao and data = v.data) then
      return 'sem_aula';
    end if;
    if exists (select 1 from public.semestres where instituicao_id = v_instituicao)
       and not exists (select 1 from public.semestres
                        where instituicao_id = v_instituicao and v.data between inicio and fim) then
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
  ponto_desembarque_nome text,
  onibus_placa text,
  motorista_nome text
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
  ex public.excecoes;
  v public.viagens_dia;
  r public.reservas;
  v_motivo text;
  v_antes int := public.parametro_num('qr_janela_antes_min', 60)::int;
  v_depois int := public.parametro_num('qr_janela_depois_min', 30)::int;
begin
  if v_aluno is null then return; end if;
  select * into ex from public.excecoes where aluno_id = v_aluno and data = p_data and status = 'aprovada';

  for m in
    select vm.* from public.viagens_modelo vm
     where (vm.id in (
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
            -- Exceção aprovada: no sentido dela, a viagem da exceção substitui as outras (RN19).
            and not (ex.id is not null and (
                  (vm.sentido = 'ida' and ex.viagem_ida_modelo_id is not null and vm.id <> ex.viagem_ida_modelo_id)
               or (vm.sentido = 'volta' and ex.viagem_volta_modelo_id is not null and vm.id <> ex.viagem_volta_modelo_id))
                 and not exists (select 1 from public.reservas rr join public.viagens_dia vd on vd.id = rr.viagem_dia_id
                                  where rr.aluno_id = v_aluno and rr.status = 'ativa' and vd.data = p_data and vd.viagem_modelo_id = vm.id)))
        or vm.id = ex.viagem_ida_modelo_id or vm.id = ex.viagem_volta_modelo_id
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
    select o.prefixo, o.placa, mu.nome into onibus_prefixo, onibus_placa, motorista_nome
      from public.viagem_dia_onibus x join public.onibus o on o.id = x.onibus_id
      left join public.usuarios mu on mu.id = x.motorista_id
     where x.id = r.viagem_dia_onibus_id;
    if not found then
      onibus_prefixo := null; onibus_placa := null; motorista_nome := null;
    end if;
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


revoke execute on function public.minhas_viagens(date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.minhas_viagens(date) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.minhas_viagens(date) to authenticated';
  end if;
end;
$$;

-- Auditoria: quem analisou o quê.
drop trigger if exists justificativas_auditoria on public.justificativas;
create trigger justificativas_auditoria after insert or update or delete on public.justificativas
  for each row execute function public.registrar_auditoria();
drop trigger if exists excecoes_auditoria on public.excecoes;
create trigger excecoes_auditoria after insert or update or delete on public.excecoes
  for each row execute function public.registrar_auditoria();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.enviar_justificativa(bigint, text, text), public.analisar_justificativa(uuid, boolean, text),
      public.pedir_excecao(date, uuid, uuid, text), public.desistir_excecao(uuid), public.analisar_excecao(uuid, boolean, text),
      public.meu_historico(int) from anon';
  end if;
end;
$$;
