-- Comprovante de residência no pré-cadastro e no cadastro do aluno.
alter table public.pre_cadastros add column if not exists residencia_path text;
alter table public.alunos add column if not exists residencia_path text;
comment on column public.alunos.residencia_path is 'Comprovante de residência (bucket documentos, pasta <aluno_id>/).';
