-- O aluno vê no app o ônibus (prefixo e placa) e o motorista da sua viagem.
-- Quando a volta 20:30 confirma, quem fica na 22:00 e muda de ônibus vê o
-- ônibus e o motorista novos, e o aviso "Seu ônibus" traz o nome do motorista.

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
             || '. Ônibus ' || o.prefixo || ' (placa ' || o.placa || ')'
             || coalesce(', motorista ' || mu.nome, '')
             || coalesce('. Embarque: ' || p.nome, '') || '.',
           jsonb_build_object('viagem_dia_id', v.id, 'reserva_id', r.id)
      from public.reservas r
      join public.viagem_dia_onibus x on x.id = r.viagem_dia_onibus_id
      join public.onibus o on o.id = x.onibus_id
      left join public.pontos p on p.id = r.ponto_id
      left join public.usuarios mu on mu.id = x.motorista_id
     where r.viagem_dia_id = p_viagem and r.status = 'ativa'
       and r.viagem_dia_onibus_id::text is distinct from (v_antes ->> r.id::text);
  end if;

  return v_total;
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
