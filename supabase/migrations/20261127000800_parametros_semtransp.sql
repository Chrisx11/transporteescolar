-- Parâmetros do sistema passam para a SEMTRANSP (o Admin agora só cria usuários e senhas).
drop policy if exists parametros_alterar on public.parametros;
create policy parametros_alterar on public.parametros for update
  using (public.eh_perfil('admin', 'semtransp'))
  with check (public.eh_perfil('admin', 'semtransp'));
