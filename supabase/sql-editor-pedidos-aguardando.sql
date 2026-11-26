-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
-- Pedidos de passe "aguardando complemento" (alunos importados das planilhas,
-- que completam CPF e documentos por um link individual).

-- =====================================================================
-- Pedidos de passe "aguardando complemento": alunos importados das planilhas
-- do sistema antigo. Já têm nome, contato, faculdade e curso; falta o CPF e
-- os documentos, que o aluno envia por um link individual (código secreto).
--   status 'aguardando' → o aluno completa pelo link → 'pendente' → análise.
-- No banco fica só o resumo (sha256) do código; o código vai no e-mail/link.
-- =====================================================================

alter type public.status_pre_cadastro add value if not exists 'aguardando';

alter table public.pre_cadastros
  alter column cpf drop not null,
  alter column cpf_path drop not null,
  alter column comprovante_path drop not null,
  add column if not exists origem text not null default 'site' check (origem in ('site', 'planilha')),
  add column if not exists linha text,
  add column if not exists dias text,
  add column if not exists observacao text,
  add column if not exists codigo_hash text unique,
  add column if not exists codigo_expira_em timestamptz,
  add column if not exists email_enviado_em timestamptz,
  add column if not exists email_erro text;

-- Para análise (pendente) o pedido precisa estar completo.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pre_cadastros_completo_para_analise') then
    alter table public.pre_cadastros add constraint pre_cadastros_completo_para_analise
      check (status::text <> 'pendente' or (cpf is not null and cpf_path is not null and comprovante_path is not null));
  end if;
end;
$$;

-- Um pedido aguardando por e-mail (evita importar o mesmo aluno duas vezes).
-- Só os pedidos aguardando têm código (ele é apagado quando o aluno completa).
create unique index if not exists pre_cadastros_email_aguardando_idx
  on public.pre_cadastros (lower(email)) where codigo_hash is not null;

notify pgrst, 'reload schema';
