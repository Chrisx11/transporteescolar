/**
 * Testes do banco: aplica as migrações num Postgres em memória (PGlite),
 * com os esquemas `auth` e `storage` do Supabase simulados, e confere
 * regras de negócio, gatilhos e Row Level Security.
 *
 * Rodar: npm test
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PASTA = join(__dirname, "..", "migrations");

// Simulação mínima do que o Supabase já traz pronto.
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

const GRANTS = `
  grant usage on schema public to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`;

let db: PGlite;

const ID = {
  admin: "00000000-0000-0000-0000-000000000001",
  semeduc: "00000000-0000-0000-0000-000000000002",
  semtransp: "00000000-0000-0000-0000-000000000003",
  alunoA: "00000000-0000-0000-0000-00000000000a",
  alunoB: "00000000-0000-0000-0000-00000000000b",
  motorista1: "00000000-0000-0000-0000-0000000000c1",
  motorista2: "00000000-0000-0000-0000-0000000000c2",
};

// CPFs válidos de teste.
const CPF = {
  admin: "52998224725",
  semeduc: "11144477735",
  semtransp: "39053344705",
  alunoA: "16899535009",
  alunoB: "71428793860",
  motorista1: "87748248800",
  motorista2: "98765432100",
};

/** Executa SQL como um usuário logado (papel authenticated + RLS). */
async function como<T = Record<string, unknown>>(usuario: keyof typeof ID, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${ID[usuario]}';`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

async function falhaComo(usuario: keyof typeof ID, sql: string, params: unknown[] = []) {
  try {
    await como(usuario, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

async function viagem(cidade: string, nome: string) {
  const r = await db.query<{ id: string }>("select id from viagens_modelo where cidade = $1 and nome = $2", [cidade, nome]);
  return r.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AMBIENTE_SUPABASE);
  for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(PASTA, arquivo), "utf8"));
  }
  await db.exec(GRANTS);

  // Usuários base (como o servidor faria, com a chave de serviço).
  for (const [k, id] of Object.entries(ID)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${k}@teste.invalid`]);
  }
  const perfis: Record<keyof typeof ID, string> = {
    admin: "admin",
    semeduc: "semeduc",
    semtransp: "semtransp",
    alunoA: "aluno",
    alunoB: "aluno",
    motorista1: "motorista",
    motorista2: "motorista",
  };
  for (const k of Object.keys(ID) as (keyof typeof ID)[]) {
    await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
      ID[k],
      CPF[k],
      `Usuário ${k}`,
      perfis[k],
    ]);
  }
  await db.exec(`
    insert into alunos (usuario_id, situacao) values ('${ID.alunoA}', 'ativo'), ('${ID.alunoB}', 'ativo');
    insert into motoristas (usuario_id) values ('${ID.motorista1}'), ('${ID.motorista2}');
    insert into onibus (prefixo, placa, capacidade) values ('01', 'AAA1A11', 40), ('02', 'BBB2B22', 44);
  `);
}, 120_000);

describe("dados iniciais", () => {
  it("grade geral da seção 5 + deslocamentos vazios", async () => {
    const r = await db.query<{ cidade: string; total: number }>(
      "select cidade::text, count(*)::int as total from viagens_modelo group by cidade order by cidade",
    );
    expect(r.rows).toEqual([
      { cidade: "campos", total: 7 },
      { cidade: "itaperuna", total: 7 },
    ]);
    const v = await db.query<{ condicional: boolean; prazo_hora: string | null }>(
      "select condicional, prazo_hora from viagens_modelo where cidade = 'itaperuna' and nome = 'Volta 20:30'",
    );
    expect(v.rows[0]).toEqual({ condicional: true, prazo_hora: null });
  });

  it("parâmetros padrão", async () => {
    const r = await db.query<{ valor: number }>("select valor from parametros where chave = 'qr_distancia_max_m'");
    expect(r.rows[0].valor).toBe(200);
  });
});

describe("regras no banco", () => {
  it("valida CPF e impede duplicidade", async () => {
    const id = "00000000-0000-0000-0000-0000000000ff";
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await expect(
      db.query("insert into usuarios (id, cpf, nome, perfil) values ($1, '52998224724', 'X', 'aluno')", [id]),
    ).rejects.toThrow(/cpf/i);
    await expect(
      db.query("insert into usuarios (id, cpf, nome, perfil) values ($1, $2, 'X', 'aluno')", [id, CPF.alunoA]),
    ).rejects.toThrow(/duplicate|unique/i);
  });

  it("prazo calculado em America/Sao_Paulo", async () => {
    const r = await db.query<{ a: string; b: string }>(`
      select to_char(calcular_prazo('2026-10-27', 'dia_anterior', '19:00') at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as a,
             to_char(calcular_prazo('2026-10-27', 'mesmo_dia', '15:00') at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as b`);
    expect(r.rows[0]).toEqual({ a: "2026-10-26 22:00", b: "2026-10-27 18:00" });
  });

  it("idas não podem bloquear por lotação (RN05)", async () => {
    await expect(
      db.query("update viagens_modelo set bloqueia_ao_lotar = true where cidade = 'campos' and nome = 'Ida manhã'"),
    ).rejects.toThrow();
  });
});

describe("escala modelo (RN11)", () => {
  it("permite ida noite 16:30 e depois volta tarde 18:15 no mesmo ônibus", async () => {
    const onibus = (await db.query<{ id: string }>("select id from onibus where prefixo = '01'")).rows[0].id;
    const ida = await viagem("campos", "Ida noite");
    const volta = await viagem("campos", "Volta tarde");
    await como("semtransp", "insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values ($1, 1, $2, $3)", [
      ida,
      onibus,
      ID.motorista1,
    ]);
    await como("semtransp", "insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values ($1, 1, $2, $3)", [
      volta,
      onibus,
      ID.motorista1,
    ]);
  });

  it("bloqueia o mesmo ônibus em viagens que se sobrepõem", async () => {
    const onibus = (await db.query<{ id: string }>("select id from onibus where prefixo = '01'")).rows[0].id;
    const erro = await falhaComo(
      "semtransp",
      "insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id) values ($1, 1, $2)",
      [await viagem("itaperuna", "Ida noite"), onibus],
    );
    expect(erro).toMatch(/Conflito de horário: este ônibus/);
  });

  it("bloqueia o mesmo motorista em ônibus diferentes no mesmo horário", async () => {
    const onibus2 = (await db.query<{ id: string }>("select id from onibus where prefixo = '02'")).rows[0].id;
    const erro = await falhaComo(
      "semtransp",
      "insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values ($1, 1, $2, $3)",
      [await viagem("itaperuna", "Ida noite"), onibus2, ID.motorista1],
    );
    expect(erro).toMatch(/este motorista/);
  });

  it("copia a escala de um dia para outro", async () => {
    const r = await como<{ total: number }>("semtransp", "select copiar_escala_modelo(1::smallint, 2::smallint) as total");
    expect(r[0].total).toBe(2);
    const c = await db.query<{ n: number }>("select count(*)::int as n from escala_modelo where dia_semana = 2");
    expect(c.rows[0].n).toBe(2);
  });

  it("motorista vê só a própria escala", async () => {
    expect((await como("motorista1", "select id from escala_modelo")).length).toBe(4);
    expect((await como("motorista2", "select id from escala_modelo")).length).toBe(0);
  });
});

describe("grade semanal", () => {
  it("recusa uma volta no lugar da ida", async () => {
    const erro = await falhaComo(
      "semeduc",
      "insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id) values ($1, 1, $2)",
      [ID.alunoA, await viagem("campos", "Volta noite")],
    );
    expect(erro).toMatch(/não é uma viagem de ida/);
  });

  it("recusa viagem em dia que ela não opera", async () => {
    const erro = await falhaComo(
      "semeduc",
      "insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id) values ($1, 7, $2)",
      [ID.alunoA, await viagem("campos", "Ida noite")],
    );
    expect(erro).toMatch(/não opera neste dia/);
  });

  it("SEMEDUC grava a grade; aluno vê só a dele", async () => {
    await como(
      "semeduc",
      "insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id, viagem_volta_modelo_id) values ($1, 1, $2, $3), ($4, 1, $2, $3)",
      [ID.alunoA, await viagem("campos", "Ida noite"), await viagem("campos", "Volta noite"), ID.alunoB],
    );
    expect((await como("alunoA", "select aluno_id from grade_semanal")).map((r) => r.aluno_id)).toEqual([ID.alunoA]);
  });
});

describe("RLS", () => {
  it("aluno lê só o próprio usuário", async () => {
    const r = await como("alunoA", "select id from usuarios");
    expect(r.map((x) => x.id)).toEqual([ID.alunoA]);
  });

  it("aluno não altera o próprio perfil nem a grade", async () => {
    await como("alunoA", "update usuarios set perfil = 'admin' where id = $1", [ID.alunoA]);
    const r = await db.query<{ perfil: string }>("select perfil::text from usuarios where id = $1", [ID.alunoA]);
    expect(r.rows[0].perfil).toBe("aluno");
    await como("alunoA", "delete from grade_semanal where aluno_id = $1", [ID.alunoA]);
    const g = await db.query<{ n: number }>("select count(*)::int as n from grade_semanal where aluno_id = $1", [ID.alunoA]);
    expect(g.rows[0].n).toBe(1);
  });

  it("aluno não lê ônibus (o token do QR é sigiloso)", async () => {
    expect((await como("alunoA", "select qr_token from onibus")).length).toBe(0);
  });

  it("aluno não lê tentativas de login nem auditoria", async () => {
    expect((await como("alunoA", "select * from tentativas_login")).length).toBe(0);
    expect((await como("alunoA", "select * from auditoria")).length).toBe(0);
  });

  it("SEMEDUC cadastra aluno mas não motorista; SEMTRANSP o contrário", async () => {
    const novo = "00000000-0000-0000-0000-0000000000d1";
    await db.query("insert into auth.users (id) values ($1)", [novo]);
    expect(
      await falhaComo("semeduc", "insert into usuarios (id, cpf, nome, perfil) values ($1, '45317828791', 'M', 'motorista')", [novo]),
    ).toMatch(/row-level security/);
    expect(
      await falhaComo("semtransp", "insert into usuarios (id, cpf, nome, perfil) values ($1, '45317828791', 'A', 'aluno')", [novo]),
    ).toMatch(/row-level security/);
    await como("semeduc", "insert into usuarios (id, cpf, nome, perfil) values ($1, '45317828791', 'A', 'aluno')", [novo]);
  });

  it("SEMTRANSP não altera alunos; SEMEDUC não altera ônibus", async () => {
    await como("semtransp", "update alunos set situacao = 'inativo' where usuario_id = $1", [ID.alunoB]);
    const a = await db.query<{ situacao: string }>("select situacao::text from alunos where usuario_id = $1", [ID.alunoB]);
    expect(a.rows[0].situacao).toBe("ativo");
    await como("semeduc", "update onibus set capacidade = 1");
    const o = await db.query<{ n: number }>("select count(*)::int as n from onibus where capacidade = 1");
    expect(o.rows[0].n).toBe(0);
  });

  it("só o admin altera parâmetros", async () => {
    await como("semtransp", "update parametros set valor = '999' where chave = 'qr_distancia_max_m'");
    await como("admin", "update parametros set valor = '250' where chave = 'qr_distancia_max_m'");
    const r = await db.query<{ valor: number }>("select valor from parametros where chave = 'qr_distancia_max_m'");
    expect(r.rows[0].valor).toBe(250);
  });

  it("usuário desativado perde as permissões do perfil", async () => {
    await db.query("update usuarios set ativo = false where id = $1", [ID.semeduc]);
    expect((await como("semeduc", "select * from alunos")).length).toBe(0);
    await db.query("update usuarios set ativo = true where id = $1", [ID.semeduc]);
  });

  it("aluno lê só arquivos da própria pasta no Storage", async () => {
    await db.exec(`insert into storage.objects (bucket_id, name) values
      ('fotos', '${ID.alunoA}/foto-1.jpg'), ('fotos', '${ID.alunoB}/foto-1.jpg')`);
    const r = await como("alunoA", "select name from storage.objects");
    expect(r.map((x) => x.name)).toEqual([`${ID.alunoA}/foto-1.jpg`]);
  });
});

describe("calendário", () => {
  it("feriado geral é único por data (instituição nula)", async () => {
    await como("semeduc", "insert into calendario (data, tipo, descricao) values ('2026-11-15', 'feriado', 'Proclamação')");
    await como(
      "semeduc",
      "insert into calendario (data, tipo, descricao) values ('2026-11-15', 'feriado', 'Proclamação da República') on conflict (instituicao_id, data) do update set descricao = excluded.descricao",
    );
    const r = await db.query<{ descricao: string }>("select descricao from calendario where data = '2026-11-15'");
    expect(r.rows).toEqual([{ descricao: "Proclamação da República" }]);
  });
});

describe("auditoria", () => {
  it("registra quem alterou, antes e depois", async () => {
    await como("semtransp", "update onibus set capacidade = 42 where prefixo = '02'");
    const r = await db.query<{ usuario_id: string; antes: { capacidade: number }; depois: { capacidade: number } }>(
      "select usuario_id, antes, depois from auditoria where tabela = 'onibus' and acao = 'UPDATE' order by id desc limit 1",
    );
    expect(r.rows[0].usuario_id).toBe(ID.semtransp);
    expect(r.rows[0].antes.capacidade).toBe(44);
    expect(r.rows[0].depois.capacidade).toBe(42);
  });

  it("admin consulta a auditoria", async () => {
    expect((await como("admin", "select id from auditoria")).length).toBeGreaterThan(0);
  });
});
