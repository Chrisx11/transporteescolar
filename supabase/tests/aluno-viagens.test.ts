/**
 * Rotas liberadas por aluno (aluno_viagens): valem em todos os dias em que a viagem opera.
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda, 27/10 = terça.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;
const SEMTRANSP = uid("aaaaaaaa", 1);
const SEMEDUC = uid("aaaaaaaa", 2);
const ALUNO = uid("bbbbbbbb", 1);
const ids: Record<string, string> = {};

const modelo = async (cidade: string, nome: string) =>
  (await db.query<{ id: string }>("select id from viagens_modelo where cidade = $1 and nome = $2", [cidade, nome])).rows[0].id;
const viagemDia = async (modeloId: string, data: string) =>
  (await db.query<{ id: string }>("select id from viagens_dia where viagem_modelo_id = $1 and data = $2", [modeloId, data])).rows[0].id;

beforeAll(async () => {
  db = await criarBanco();
  for (const [id, perfil, n] of [
    [SEMTRANSP, "semtransp", 1],
    [SEMEDUC, "semeduc", 2],
    [ALUNO, "aluno", 3],
  ] as const) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
      id,
      cpfDe(500000000 + n),
      `Pessoa ${n}`,
      perfil,
    ]);
  }
  await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [ALUNO]);
  ids.idaNoiteCampos = await modelo("campos", "Ida noite");
  ids.voltaNoiteCampos = await modelo("campos", "Volta noite");
  ids.idaNoiteIta = await modelo("itaperuna", "Ida noite");
  ids.idaManhaCampos = await modelo("campos", "Ida manhã");

  // SEMEDUC libera 3 rotas: ida e volta noite de Campos e ida noite de Itaperuna.
  await como(
    db,
    SEMEDUC,
    "insert into aluno_viagens (aluno_id, viagem_modelo_id) values ($1, $2), ($1, $3), ($1, $4)",
    [ALUNO, ids.idaNoiteCampos, ids.voltaNoiteCampos, ids.idaNoiteIta],
  );

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
}, 180_000);

describe("rotas liberadas", () => {
  it("o aluno vê as rotas liberadas de segunda, em ordem de horário", async () => {
    const r = await como<{ nome: string; cidade: string }>(db, ALUNO, "select nome, cidade from minhas_viagens('2026-10-26')");
    expect(r).toEqual([
      { nome: "Ida noite", cidade: "campos" },
      { nome: "Ida noite", cidade: "itaperuna" },
      { nome: "Volta noite", cidade: "campos" },
    ]);
  });

  it("reserva rota liberada, recusa a que não foi liberada", async () => {
    await como(db, ALUNO, "select reservar($1)", [await viagemDia(ids.idaNoiteCampos, "2026-10-26")]);
    expect(await falhaComo(db, ALUNO, "select reservar($1)", [await viagemDia(ids.idaManhaCampos, "2026-10-27")])).toMatch(/grade/);
  });

  it("dia sem aula da faculdade (pelo curso na cidade) bloqueia só aquela cidade", async () => {
    const uenf = (await db.query<{ id: string }>("insert into instituicoes (nome, cidade) values ('UENF', 'campos') returning id")).rows[0].id;
    await como(db, SEMEDUC, "insert into aluno_vinculos (aluno_id, instituicao_id, curso, turno) values ($1, $2, 'Eng.', 'noite')", [ALUNO, uenf]);
    await db.query("insert into calendario (instituicao_id, data, tipo, descricao) values ($1, '2026-10-27', 'sem_aula', 'Semana acadêmica')", [uenf]);
    const r = await como<{ nome: string; cidade: string; motivo: string | null }>(
      db,
      ALUNO,
      "select nome, cidade, motivo from minhas_viagens('2026-10-27')",
    );
    expect(r.find((x) => x.cidade === "campos" && x.nome === "Ida noite")?.motivo).toBe("sem_aula");
    // Itaperuna não tem curso cadastrado: o dia sem aula da UENF não a afeta (só ainda não abriu).
    expect(r.find((x) => x.cidade === "itaperuna")?.motivo).toBe("ainda_nao_abriu");
  });

  it("ao reservar escolhe embarque em Italva e desembarque na cidade; pode trocar no prazo", async () => {
    const ponto = async (nome: string, cidade: string) =>
      (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ($1, $2, 1) returning id", [nome, cidade])).rows[0].id;
    const praca = await ponto("Praça", "italva");
    const rodo = await ponto("Rodoviária", "italva");
    const uenfP = await ponto("Portão UENF", "campos");
    const v = await viagemDia(ids.voltaNoiteCampos, "2026-10-26");
    // Volta: embarque em Campos, desembarque em Italva. Ponto de Italva no embarque é recusado.
    expect(await falhaComo(db, ALUNO, "select reservar($1, $2, $3)", [v, praca, rodo])).toMatch(/embarque em Campos/);
    await como(db, ALUNO, "select reservar($1, $2, $3)", [v, uenfP, praca]);
    await como(db, ALUNO, "select reservar($1, null, $2)", [v, rodo]); // troca só o desembarque
    const r = await como<{ ponto_nome: string; ponto_desembarque_nome: string }>(
      db,
      ALUNO,
      "select ponto_nome, ponto_desembarque_nome from minhas_viagens('2026-10-26') where viagem_dia_id = $1",
      [v],
    );
    expect(r[0]).toEqual({ ponto_nome: "Portão UENF", ponto_desembarque_nome: "Rodoviária" });
  });

  it("SEMTRANSP move todos de um ponto para outro ônibus", async () => {
    const on1 = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('01', 'AAA1A11', 40) returning id")).rows[0].id;
    const on2 = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('02', 'BBB2B22', 40) returning id")).rows[0].id;
    const v = await viagemDia(ids.voltaNoiteCampos, "2026-10-26");
    const t1 = (await db.query<{ id: string }>("insert into viagem_dia_onibus (viagem_dia_id, onibus_id) values ($1, $2) returning id", [v, on1])).rows[0].id;
    const t2 = (await db.query<{ id: string }>("insert into viagem_dia_onibus (viagem_dia_id, onibus_id) values ($1, $2) returning id", [v, on2])).rows[0].id;
    await como(db, SEMTRANSP, "select alocar_viagem($1)", [v]);
    const pontoUenf = (await db.query<{ ponto_id: string }>("select ponto_id from reservas where viagem_dia_id = $1 and status = 'ativa'", [v])).rows[0].ponto_id;
    const [{ mover_ponto }] = await como<{ mover_ponto: number }>(db, SEMTRANSP, "select mover_ponto($1, $2, $3)", [v, pontoUenf, t2]);
    expect(mover_ponto).toBeLessThanOrEqual(1);
    const r = await db.query<{ vdo: string }>("select viagem_dia_onibus_id as vdo from reservas where viagem_dia_id = $1 and status = 'ativa'", [v]);
    expect(r.rows.every((x) => x.vdo === t2)).toBe(true);
    expect(t1).not.toBe(t2);
    expect(await falhaComo(db, ALUNO, "select mover_ponto($1, $2, $3)", [v, pontoUenf, t1])).toMatch(/permissão/);
  });

  it("aluno não libera rota para si mesmo", async () => {
    const erro = await falhaComo(db, ALUNO, "insert into aluno_viagens (aluno_id, viagem_modelo_id) values ($1, $2)", [ALUNO, ids.idaManhaCampos]);
    expect(erro).toMatch(/row-level security/i);
  });
});
