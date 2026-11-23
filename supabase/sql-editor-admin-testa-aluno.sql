-- Cole no SQL Editor do Supabase e rode UMA vez (Admin pode reservar como aluno para testar).

-- O Admin pode testar o app do aluno com o próprio login (precisa ter cadastro em alunos).

create or replace function public.reservar(p_viagem uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  v_motivo text;
  v_id uuid;
begin
  if v_aluno is null or not public.eh_perfil('aluno', 'admin') then
    raise exception 'Entre como aluno para reservar.' using errcode = 'P0001';
  end if;
  -- Trava a viagem: reservas simultâneas são conferidas uma de cada vez.
  perform 1 from public.viagens_dia where id = p_viagem for update;

  select id into v_id from public.reservas where aluno_id = v_aluno and viagem_dia_id = p_viagem and status = 'ativa';
  if found then return v_id; end if;

  v_motivo := public.motivo_bloqueio(v_aluno, p_viagem);
  if v_motivo is not null then
    raise exception '%', public.mensagem_motivo(v_motivo) using errcode = 'P0001';
  end if;

  insert into public.reservas (aluno_id, viagem_dia_id, ponto_id)
  values (v_aluno, p_viagem, public.ponto_do_aluno(v_aluno, p_viagem))
  returning id into v_id;
  return v_id;
end;
$$;
