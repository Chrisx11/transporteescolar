/** Pré-cadastro: só SEMEDUC/Admin leem e alteram; um pedido pendente por CPF. */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, uid } from "./apoio";

let db: PGlite;
const SEMEDUC = uid("aaaaaaaa", 1);
const ALUNO = uid("bbbbbbbb", 1);
const novo = (cpf: string) =>
  db.query(
    `insert into pre_cadastros (nome, cpf, telefone, cidade, instituicao_outra, curso, turno, cpf_path, comprovante_path)
     values ('Fulano', $1, '(22) 99999-0000', 'campos', 'UENF', 'Direito', 'noite', 'pre-cadastro/x/cpf.pdf', 'pre-cadastro/x/comp.pdf')`,
    [cpf],
  );

beforeAll(async () => {
  db = await criarBanco();
  for (const [id, perfil, n] of [[SEMEDUC, "semeduc", 1], [ALUNO, "aluno", 2]] as const) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into usuarios (id, cpf, nome, perfil) values ($1, $2, 'X', $3)", [id, cpfDe(600000000 + n), perfil]);
  }
  await novo("11122233344");
}, 120_000);

describe("pré-cadastro", () => {
  it("SEMEDUC lê; aluno não lê nem grava", async () => {
    expect((await como(db, SEMEDUC, "select id from pre_cadastros")).length).toBe(1);
    expect((await como(db, ALUNO, "select id from pre_cadastros")).length).toBe(0);
    expect(await falhaComo(db, ALUNO, "update pre_cadastros set status = 'aprovado'")).toBeNull(); // RLS: não afeta linhas
    const r = await db.query<{ status: string }>("select status from pre_cadastros");
    expect(r.rows[0].status).toBe("pendente");
  });

  it("não aceita dois pedidos pendentes do mesmo CPF", async () => {
    await expect(novo("11122233344")).rejects.toThrow(/duplicate|unique/i);
  });

  it("exige a instituição (da lista ou escrita)", async () => {
    await expect(
      db.query(
        `insert into pre_cadastros (nome, cpf, telefone, cidade, curso, turno, cpf_path, comprovante_path)
         values ('A', '55566677788', '1', 'campos', 'C', 'noite', 'a', 'b')`,
      ),
    ).rejects.toThrow(/check/i);
  });
});
