/**
 * Apoio aos testes do banco: Postgres em memória (PGlite) com os esquemas
 * `auth` e `storage` do Supabase simulados e todas as migrações aplicadas.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PASTA = join(__dirname, "..", "migrations");

const AMBIENTE_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
`;

// O Supabase concede isto por padrão às tabelas do esquema public.
const GRANTS = `
  grant usage on schema public to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
`;

export async function criarBanco(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(AMBIENTE_SUPABASE);
  for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(PASTA, arquivo), "utf8"));
  }
  await db.exec(GRANTS);
  return db;
}

/** Executa SQL como um usuário logado (papel authenticated + RLS). */
export async function como<T = Record<string, unknown>>(db: PGlite, usuarioId: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${usuarioId}';`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

/** Mesma coisa, mas devolve a mensagem de erro (ou null se não falhou). */
export async function falhaComo(db: PGlite, usuarioId: string, sql: string, params: unknown[] = []) {
  try {
    await como(db, usuarioId, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

/** Fixa o relógio do sistema (função agora()) num instante de São Paulo. */
export async function relogio(db: PGlite, instante: string) {
  await db.exec(`set app.ambiente = 'teste'; set app.agora = '${instante}';`);
}

/** Gera um CPF válido a partir de 9 dígitos. */
export function cpfDe(base: number): string {
  const d = String(base).padStart(9, "0").split("").map(Number);
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

/** UUID previsível para os testes: prefixo + número. */
export function uid(prefixo: string, n: number): string {
  return `${prefixo.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
