-- Lista prévia do motorista: antes do prazo fechar (alunos ainda sem ônibus),
-- o motorista já vê todos os reservados da viagem, em tempo real.
-- Depois da alocação, vê só os alunos do ônibus dele (como antes).

drop function if exists public.lista_embarque(uuid);
create function public.lista_embarque(p_vdo uuid)
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
  resultado public.resultado_frequencia,
  desembarque_nome text,
  previa boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viagem uuid;
begin
  if not (public.eh_motorista_do_onibus_dia(p_vdo) or public.eh_perfil('semtransp', 'semeduc', 'admin')) then
    raise exception 'Esta viagem não está na sua escala.' using errcode = 'P0001';
  end if;
  select viagem_dia_id into v_viagem from public.viagem_dia_onibus where id = p_vdo;
  return query
    select r.id, r.aluno_id, u.nome, a.foto_path, p.nome, p.ordem,
           e.id is not null, e.tipo, e.motivo_manual, coalesce(e.verificado_localizacao, false), e.registrado_em,
           f.resultado, d.nome, r.viagem_dia_onibus_id is null
      from public.reservas r
      join public.usuarios u on u.id = r.aluno_id
      join public.alunos a on a.usuario_id = r.aluno_id
      left join public.pontos p on p.id = r.ponto_id
      left join public.pontos d on d.id = r.ponto_desembarque_id
      left join public.embarques e on e.reserva_id = r.id
      left join public.frequencia f on f.reserva_id = r.id
     where r.status = 'ativa'
       and (r.viagem_dia_onibus_id = p_vdo or (r.viagem_dia_onibus_id is null and r.viagem_dia_id = v_viagem))
     order by p.ordem nulls last, p.nome nulls last, u.nome;
end;
$$;

revoke execute on function public.lista_embarque(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.lista_embarque(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.lista_embarque(uuid) to authenticated';
  end if;
end;
$$;
