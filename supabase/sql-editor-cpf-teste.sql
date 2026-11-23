-- Cole no SQL Editor do Supabase e rode UMA vez (permite cadastrar CPFs de teste).

-- O banco passa a conferir só o formato do CPF (11 dígitos).
-- Os dígitos verificadores são conferidos pelo app (src/lib/cpf.ts), que pode ser
-- colocado em modo de teste com ACEITAR_CPF_DE_TESTE=sim para aceitar CPFs fictícios.
create or replace function public.cpf_valido(p_cpf text)
returns boolean
language sql
immutable
as $$
  select p_cpf is not null and p_cpf ~ '^\d{11}$';
$$;
