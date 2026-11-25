-- =====================================================================
-- Linha dos pontos: cada ponto serve a linha de Campos ou a de Itaperuna.
--   Ida · Italva x Campos      → pontos em Italva da linha de Campos
--   Ida · Italva x Itaperuna   → pontos em Italva da linha de Itaperuna
--   Volta · Campos x Italva    → pontos em Campos
--   Volta · Itaperuna x Italva → pontos em Itaperuna
-- Na reserva, o aluno só vê os pontos da linha da viagem (pontos de Italva
-- sem linha definida, cadastrados antes, valem para as duas).
-- =====================================================================

alter table public.pontos add column if not exists linha public.cidade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pontos_linha_valida') then
    alter table public.pontos add constraint pontos_linha_valida
      check (linha is null or (linha in ('campos', 'itaperuna') and (cidade = 'italva' or cidade = linha)));
  end if;
end;
$$;
update public.pontos set linha = cidade where cidade <> 'italva' and linha is null;

-- Ponto ativo, na cidade certa e da linha da viagem?
create or replace function public.ponto_serve(p_ponto uuid, p_cidade public.cidade, p_linha public.cidade)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pontos
                  where id = p_ponto and cidade = p_cidade and ativo
                    and (linha is null or linha = p_linha));
$$;

drop function if exists public.reservar(uuid, uuid, uuid);
create function public.reservar(p_viagem uuid, p_ponto_embarque uuid default null, p_ponto_desembarque uuid default null)
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

  insert into public.reservas (aluno_id, viagem_dia_id, ponto_id, ponto_desembarque_id)
  values (v_aluno, p_viagem, coalesce(p_ponto_embarque, public.ponto_do_aluno(v_aluno, p_viagem)), p_ponto_desembarque)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.reservar(uuid, uuid, uuid), public.ponto_serve(uuid, public.cidade, public.cidade) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.reservar(uuid, uuid, uuid), public.ponto_serve(uuid, public.cidade, public.cidade) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.ponto_serve(uuid, public.cidade, public.cidade) from authenticated';
    execute 'grant execute on function public.reservar(uuid, uuid, uuid) to authenticated';
  end if;
end;
$$;
