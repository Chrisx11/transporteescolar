-- Painel do dia: a faixa da volta 20:30 ("X de 10 reservaram") se atualiza sozinha.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'liberacoes_2030') then
      alter publication supabase_realtime add table public.liberacoes_2030;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reservas_2030') then
      alter publication supabase_realtime add table public.reservas_2030;
    end if;
  end if;
end;
$$;
