-- Dia sem transporte lançado depois que as viagens já foram geradas (elas são
-- geradas 2 dias antes). Sem isto, as reservas daquele dia continuariam ativas e
-- o encerramento automático lançaria falta para todos.
--  * Feriado/recesso geral (sem instituição): as viagens do dia que ainda não
--    começaram são canceladas e os alunos reservados recebem aviso (sem falta:
--    viagem cancelada não é encerrada nem gera frequência).
--  * Dia sem aula de uma instituição: as reservas dos alunos dessa instituição
--    naquele dia são canceladas, com aviso.
-- Remover o dia do calendário depois não desfaz os cancelamentos.

create or replace function public.aplicar_dia_sem_transporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if new.data < public.hoje_sp() then
    return new;
  end if;

  if new.instituicao_id is null and new.tipo in ('feriado', 'recesso') then
    for v in
      select * from public.viagens_dia
       where data = new.data and status in ('agendada', 'prazo_fechado')
       for update
    loop
      update public.viagens_dia
         set status = 'cancelada', ocorrencia_descricao = 'Sem transporte: ' || new.descricao
       where id = v.id;
      insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
      select r.aluno_id, 'viagem_cancelada', 'Viagem cancelada: ' || v.nome,
             'Não haverá transporte em ' || to_char(v.data, 'DD/MM') || ' (' || new.descricao || '). '
               || 'Sua reserva das ' || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' foi cancelada, sem falta.',
             jsonb_build_object('viagem_dia_id', v.id)
        from public.reservas r
       where r.viagem_dia_id = v.id and r.status = 'ativa';
    end loop;
    return new;
  end if;

  -- Dia sem aula de uma instituição (ou feriado só dela): cancela as reservas dos alunos afetados.
  for v in
    select r.id as reserva_id, r.aluno_id, vd.id as viagem_id, vd.nome, vd.data, vd.saida_em
      from public.reservas r
      join public.viagens_dia vd on vd.id = r.viagem_dia_id
     where vd.data = new.data and vd.status in ('agendada', 'prazo_fechado') and r.status = 'ativa'
       and public.motivo_bloqueio(r.aluno_id, vd.id) in ('sem_aula', 'sem_operacao')
  loop
    update public.reservas set status = 'cancelada', cancelada_em = public.agora() where id = v.reserva_id;
    insert into public.notificacoes (usuario_id, evento, titulo, conteudo, referencia)
    values (v.aluno_id, 'viagem_cancelada', 'Reserva cancelada: ' || v.nome,
            'Sua faculdade não terá aula em ' || to_char(v.data, 'DD/MM') || ' (' || new.descricao || '). '
              || 'Sua reserva das ' || to_char(v.saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' foi cancelada, sem falta.',
            jsonb_build_object('viagem_dia_id', v.viagem_id));
  end loop;
  return new;
end;
$$;

drop trigger if exists calendario_aplicar_dia on public.calendario;
create trigger calendario_aplicar_dia after insert or update on public.calendario
  for each row execute function public.aplicar_dia_sem_transporte();

revoke execute on function public.aplicar_dia_sem_transporte() from public;
