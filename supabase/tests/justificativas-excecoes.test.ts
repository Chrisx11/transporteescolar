/**
 * Fase 5 (final) — justificativa de falta (RN17, cenário 17 da análise) e
 * exceção de data (RN19, cenário 15).
 *
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda, 27/10 = terça.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;

const SEMEDUC = uid("aaaaaaaa", 2);
const SEMTRANSP = uid("aaaaaaaa", 1);
const M1 = uid("eeeeeeee", 1);
const A = uid("bbbbbbbb", 1);
const B = uid("bbbbbbbb", 2);
const ids: Record<string, string> = {};
let cpf = 600000000;

async function usuario(id: string, perfil: string) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
    id,
    cpfDe(cpf++),
    `Pessoa ${id.slice(-2)}`,
    perfil,
  ]);
}
async function aluno(id: string) {
  await usuario(id, "aluno");
  await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [id]);
}
const modelo = async (nome: string) =>
  (await db.query<{ id: string }>("select id from viagens_modelo where cidade = 'campos' and nome = $1", [nome])).rows[0].id;
const viagem = async (modeloId: string, data: string) =>
  (await db.query<{ id: string }>("select id from viagens_dia where viagem_modelo_id = $1 and data = $2", [modeloId, data])).rows[0].id;

beforeAll(async () => {
  db = await criarBanco();
  await usuario(SEMEDUC, "semeduc");
  await usuario(SEMTRANSP, "semtransp");
  await usuario(M1, "motorista");
  await db.query("insert into motoristas (usuario_id) values ($1)", [M1]);
  const o = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('01', 'AAA1A11', 40) returning id")).rows[0];
  ids.idaManha = await modelo("Ida manhã");
  ids.idaTarde = await modelo("Ida tarde");
  ids.voltaTarde = await modelo("Volta tarde");
  await db.query("insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values ($1, 1, $2, $3)", [ids.idaManha, o.id, M1]);
  await aluno(A);
  await aluno(B);
  // A: ida manhã na segunda e na terça (grade).
  await db.query(
    "insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id) values ($1, 1, $2), ($1, 2, $2)",
    [A, ids.idaManha],
  );

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  ids.vSeg = await viagem(ids.idaManha, "2026-10-26");
  await como(db, A, "select reservar($1)", [ids.vSeg]);
  await relogio(db, "2026-10-25 19:05:00-03");
  await como(db, SEMTRANSP, "select fechar_prazos()");
  // Segunda: o ônibus sai e A não embarca → falta.
  await relogio(db, "2026-10-26 05:00:00-03");
  ids.t = (await db.query<{ id: string }>("select id from viagem_dia_onibus where viagem_dia_id = $1", [ids.vSeg])).rows[0].id;
  await como(db, M1, "select iniciar_trecho($1)", [ids.t]);
  await como(db, M1, "select encerrar_trecho($1)", [ids.t]);
  ids.freq = String(
    (await db.query<{ id: number }>("select id from frequencia where aluno_id = $1 and resultado = 'falta'", [A])).rows[0].id,
  );
}, 180_000);

describe("justificativa de falta", () => {
  it("o histórico mostra a falta com o botão de justificar", async () => {
    const h = await como<{ resultado: string; pode_justificar: boolean }>(db, A, "select resultado, pode_justificar from meu_historico(90)");
    expect(h).toEqual([{ resultado: "falta", pode_justificar: true }]);
  });

  it("outro aluno não justifica a falta de A; anexo de outra pasta é recusado", async () => {
    expect(await falhaComo(db, B, "select enviar_justificativa($1, 'Estava doente')", [ids.freq])).toMatch(/não encontrada/);
    expect(await falhaComo(db, A, "select enviar_justificativa($1, 'Estava doente', $2)", [ids.freq, `${B}/justificativa-1.pdf`])).toMatch(
      /Anexo inválido/,
    );
  });

  it("A envia a justificativa com atestado; não dá para enviar outra", async () => {
    await como(db, A, "select enviar_justificativa($1, 'Estava doente, segue atestado', $2)", [ids.freq, `${A}/justificativa-1.pdf`]);
    expect(await falhaComo(db, A, "select enviar_justificativa($1, 'De novo')", [ids.freq])).toMatch(/já tem uma justificativa/);
    const h = await como<{ justificativa_status: string; pode_justificar: boolean }>(
      db,
      A,
      "select justificativa_status, pode_justificar from meu_historico(90)",
    );
    expect(h[0]).toEqual({ justificativa_status: "pendente", pode_justificar: false });
  });

  it("só a SEMEDUC analisa; recusar exige motivo", async () => {
    const j = (await db.query<{ id: string }>("select id from justificativas")).rows[0].id;
    ids.j = j;
    expect(await falhaComo(db, SEMTRANSP, "select analisar_justificativa($1, true)", [j])).toMatch(/Educação/);
    expect(await falhaComo(db, SEMEDUC, "select analisar_justificativa($1, false, '')", [j])).toMatch(/motivo da recusa/);
  });

  it("aprovada: a falta vira justificada e o aluno é avisado", async () => {
    await como(db, SEMEDUC, "select analisar_justificativa($1, true)", [ids.j]);
    const f = await db.query<{ resultado: string }>("select resultado from frequencia where id = $1", [ids.freq]);
    expect(f.rows[0].resultado).toBe("justificada");
    const n = await db.query<{ titulo: string }>("select titulo from notificacoes where usuario_id = $1 and evento = 'justificativa_aprovada'", [A]);
    expect(n.rows[0].titulo).toBe("Falta justificada");
    expect(await falhaComo(db, SEMEDUC, "select analisar_justificativa($1, false, 'teste')", [ids.j])).toMatch(/já foi analisada/);
  });

  it("depois do prazo (15 dias) não dá mais para justificar", async () => {
    await db.query("update frequencia set resultado = 'falta' where id = $1", [ids.freq]);
    await db.query("update justificativas set status = 'recusada'");
    await relogio(db, "2026-11-12 10:00:00-03");
    expect(await falhaComo(db, A, "select enviar_justificativa($1, 'Estava doente')", [ids.freq])).toMatch(/prazo/);
    await db.query("update frequencia set resultado = 'justificada' where id = $1", [ids.freq]);
    await relogio(db, "2026-10-26 10:00:00-03");
  });
});

describe("exceção de data (troca de horário)", () => {
  it("valida o pedido", async () => {
    expect(await falhaComo(db, A, "select pedir_excecao('2026-10-20', $1, null, 'Prova de manhã')", [ids.idaTarde])).toMatch(/hoje em diante/);
    expect(await falhaComo(db, A, "select pedir_excecao('2026-10-27', null, null, 'Prova de manhã')")).toMatch(/ida, a volta/);
    expect(await falhaComo(db, A, "select pedir_excecao('2026-10-27', $1, null, 'ok')", [ids.idaTarde])).toMatch(/motivo/);
    expect(await falhaComo(db, A, "select pedir_excecao('2026-10-27', $1, null, 'Prova de manhã')", [ids.voltaTarde])).toMatch(/Ida inválida/);
  });

  it("A pede a ida tarde na terça; não dá para pedir duas para o mesmo dia", async () => {
    await como(db, A, "select pedir_excecao('2026-10-27', $1, null, 'Prova de manhã')", [ids.idaTarde]);
    expect(await falhaComo(db, A, "select pedir_excecao('2026-10-27', $1, null, 'Outro motivo')", [ids.idaTarde])).toMatch(/já tem um pedido/);
  });

  it("antes da aprovação, A só vê a ida manhã da grade na terça", async () => {
    const t = await como<{ nome: string }>(db, A, "select nome from minhas_viagens('2026-10-27')");
    expect(t.map((x) => x.nome)).toEqual(["Ida manhã"]);
  });

  it("cenário 15 — aprovada: na terça a ida tarde substitui a ida manhã, só naquela data", async () => {
    const x = (await db.query<{ id: string }>("select id from excecoes")).rows[0].id;
    await como(db, SEMEDUC, "select analisar_excecao($1, true)", [x]);
    const t = await como<{ nome: string }>(db, A, "select nome from minhas_viagens('2026-10-27')");
    expect(t.map((v) => v.nome)).toEqual(["Ida tarde"]);
    // Segunda (sem exceção) continua com a grade normal.
    const s = await como<{ nome: string }>(db, A, "select nome from minhas_viagens('2026-10-26')");
    expect(s.map((v) => v.nome)).toEqual(["Ida manhã"]);
    // Reserva: a da exceção vale; a substituída não.
    expect(await falhaComo(db, A, "select reservar($1)", [await viagem(ids.idaManha, "2026-10-27")])).toMatch(/grade/);
    await como(db, A, "select reservar($1)", [await viagem(ids.idaTarde, "2026-10-27")]);
    const n = await db.query<{ n: number }>("select count(*)::int as n from notificacoes where usuario_id = $1 and evento = 'excecao_aprovada'", [A]);
    expect(n.rows[0].n).toBe(1);
  });

  it("A pode desistir de um pedido; a SEMEDUC não analisa o que já foi analisado", async () => {
    const x = (await db.query<{ id: string }>("select id from excecoes")).rows[0].id;
    expect(await falhaComo(db, SEMEDUC, "select analisar_excecao($1, false, 'não')", [x])).toMatch(/já foi analisado/);
    await como(db, A, "select desistir_excecao($1)", [x]);
    expect(await falhaComo(db, B, "select desistir_excecao($1)", [x])).toMatch(/não encontrado/);
  });
});
