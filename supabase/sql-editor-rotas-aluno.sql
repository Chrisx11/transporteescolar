-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
-- Cria as "rotas liberadas" por aluno (Campos/Itaperuna, idas e voltas marcadas).

-- =====================================================================
-- Rotas liberadas por aluno (substitui a grade semanal na tela da SEMEDUC).
-- A SEMEDUC marca quais viagens modelo (idas e voltas) o aluno pode reservar;
-- vale em todos os dias em que a viagem opera. A grade semanal antiga continua
-- valendo para quem ainda a tem (as duas formas liberam a viagem).
-- A instituição do dia (para os dias sem aula do calendário) vem do curso do
-- aluno na cidade da viagem.
-- =====================================================================

create table if not exists public.aluno_viagens (
  aluno_id uuid not null references public.alunos (usuario_id) on delete cascade,
  viagem_modelo_id uuid not null references public.viagens_modelo (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (aluno_id, viagem_modelo_id)
);
create index if not exists aluno_viagens_modelo_idx on public.aluno_viagens (viagem_modelo_id);

alter table public.aluno_viagens enable row level security;
drop policy if exists aluno_viagens_ler on public.aluno_viagens;
create policy aluno_viagens_ler on public.aluno_viagens for select
  using (aluno_id = auth.uid() or public.eh_perfil('semeduc', 'semtransp', 'admin'));
drop policy if exists aluno_viagens_escrever on public.aluno_viagens;
create policy aluno_viagens_escrever on public.aluno_viagens for all
  using (public.eh_perfil('semeduc', 'admin')) with check (public.eh_perfil('semeduc', 'admin'));

drop trigger if exists aluno_viagens_auditoria on public.aluno_viagens;
create trigger aluno_viagens_auditoria after insert or update or delete on public.aluno_viagens
  for each row execute function public.registrar_auditoria();

-- Instituição do aluno na cidade (pelo curso cadastrado).
create or replace function public.instituicao_do_aluno(p_aluno uuid, p_cidade public.cidade)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select i.id from public.aluno_vinculos av join public.instituicoes i on i.id = av.instituicao_id
   where av.aluno_id = p_aluno and i.cidade = p_cidade
   order by av.id limit 1;
$$;

-- ---------------------------------------------------------------------
-- Regras da reserva: a viagem precisa estar nas rotas do aluno OU na grade do dia.
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

-- ---------------------------------------------------------------------
-- Tela do aluno: as viagens da grade do dia + as rotas liberadas que operam no dia.
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

revoke execute on function public.minhas_viagens(date), public.instituicao_do_aluno(uuid, public.cidade) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.minhas_viagens(date), public.instituicao_do_aluno(uuid, public.cidade) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.instituicao_do_aluno(uuid, public.cidade) from authenticated';
    execute 'grant execute on function public.minhas_viagens(date) to authenticated';
  end if;
end;
$$;

notify pgrst, 'reload schema';
