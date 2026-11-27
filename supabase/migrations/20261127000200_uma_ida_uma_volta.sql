-- Uma ida e uma volta por dia: com uma ida reservada, o aluno não reserva
-- outra ida no mesmo dia (idem volta), e a volta precisa sair depois da ida.
-- Para trocar de horário, ele cancela a reserva e reserva a outra (dentro do prazo).
-- Só a função reservar muda (mesma assinatura e permissões).

create or replace function public.reservar(p_viagem uuid, p_ponto_embarque uuid default null, p_ponto_desembarque uuid default null)
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
  v_outra text;
  v_hora timestamptz;
begin
  if v_aluno is null or not public.eh_perfil('aluno', 'admin') then
    raise exception 'Entre como aluno para reservar.' using errcode = 'P0001';
  end if;
  -- Trava a viagem: reservas simultâneas são conferidas uma de cada vez.
  select * into v from public.viagens_dia where id = p_viagem for update;
  if not found then raise exception 'Viagem não encontrada.' using errcode = 'P0001'; end if;

  v_cid_emb := case when v.sentido = 'ida' then 'italva' else v.cidade end;
  v_cid_des := case when v.sentido = 'ida' then v.cidade else 'italva' end;
  if p_ponto_embarque is not null and not public.ponto_serve(p_ponto_embarque, v_cid_emb, v.cidade) then
    raise exception 'Escolha um ponto de embarque em % desta linha.', initcap(v_cid_emb::text) using errcode = 'P0001';
  end if;
  if p_ponto_desembarque is not null and not public.ponto_serve(p_ponto_desembarque, v_cid_des, v.cidade) then
    raise exception 'Escolha um ponto de desembarque em % desta linha.', initcap(v_cid_des::text) using errcode = 'P0001';
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

  -- Uma ida e uma volta por dia (deslocamento vazio não tem reserva).
  select vd.nome into v_outra
    from public.reservas r join public.viagens_dia vd on vd.id = r.viagem_dia_id
   where r.aluno_id = v_aluno and r.status = 'ativa' and vd.data = v.data and vd.sentido = v.sentido and vd.id <> v.id
   limit 1;
  if found then
    raise exception 'Você já reservou a % deste dia. Para trocar, cancele aquela reserva primeiro.', lower(v_outra)
      using errcode = 'P0001';
  end if;
  -- A volta sai depois da ida.
  if v.sentido = 'volta' then
    select vd.saida_em into v_hora
      from public.reservas r join public.viagens_dia vd on vd.id = r.viagem_dia_id
     where r.aluno_id = v_aluno and r.status = 'ativa' and vd.data = v.data and vd.sentido = 'ida' and vd.saida_em >= v.saida_em
     limit 1;
    if found then
      raise exception 'Esta volta sai antes da sua ida (%). Escolha uma volta mais tarde.',
        to_char(v_hora at time zone 'America/Sao_Paulo', 'HH24:MI') using errcode = 'P0001';
    end if;
  elsif v.sentido = 'ida' then
    select vd.saida_em into v_hora
      from public.reservas r join public.viagens_dia vd on vd.id = r.viagem_dia_id
     where r.aluno_id = v_aluno and r.status = 'ativa' and vd.data = v.data and vd.sentido = 'volta' and vd.saida_em <= v.saida_em
     limit 1;
    if found then
      raise exception 'Esta ida sai depois da sua volta (%). Cancele a volta ou escolha uma ida mais cedo.',
        to_char(v_hora at time zone 'America/Sao_Paulo', 'HH24:MI') using errcode = 'P0001';
    end if;
  end if;

  insert into public.reservas (aluno_id, viagem_dia_id, ponto_id, ponto_desembarque_id)
  values (v_aluno, p_viagem, coalesce(p_ponto_embarque, public.ponto_do_aluno(v_aluno, p_viagem)), p_ponto_desembarque)
  returning id into v_id;
  return v_id;
end;
$$;
