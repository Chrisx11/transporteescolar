/**
 * Fase 5 — avisos que viram notificação no celular.
 * Ônibus no ponto (só o 1º embarque de cada ponto), lembrete de reserva,
 * matrícula vencendo, avisos do motorista e a fila de envio do push.
 *
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda (ida manhã de Campos 05:30, prazo 19:00 de domingo).
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, relogio, uid } from "./apoio";

let db: PGlite;

const SEMTRANSP = uid("aaaaaaaa", 1);
const M1 = uid("eeeeeeee", 1);
const M2 = uid("eeeeeeee", 2);
const A = uid("bbbbbbbb", 1); // ponto 1
const B = uid("bbbbbbbb", 2); // ponto 1
const C = uid("bbbbbbbb", 3); // ponto 2 (depois na rota)
const D = uid("bbbbbbbb", 4); // ponto 0 (antes na rota)
const E = uid("bbbbbbbb", 5); // tem a ida liberada, mas não reservou

const PERTO = { lat: -21.4206, lng: -41.6913 };
const ids: Record<string, string> = {};
let cpf = 500000000;

async function usuario(id: string, perfil: string) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
    id,
    cpfDe(cpf++),
    `Pessoa ${id.slice(-2)}`,
    perfil,
  ]);
}

async function aluno(id: string, ponto: string, validade = "2026-12-31") {
  await usuario(id, "aluno");
  await db.query("insert into alunos (usuario_id, situacao, matricula_validade, ponto_ida_padrao_id) values ($1, 'ativo', $2, $3)", [
    id,
    validade,
    ponto,
  ]);
  await db.query("insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id) values ($1, 1, $2)", [id, ids.idaManha]);
}

const avisos = async (usuarioId: string, evento: string) =>
  (await db.query<{ titulo: string; conteudo: string }>(
    "select titulo, conteudo from notificacoes where usuario_id = $1 and evento = $2 order by id",
    [usuarioId, evento],
  )).rows;
const total = async (evento: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from notificacoes where evento = $1", [evento])).rows[0].n;

beforeAll(async () => {
  db = await criarBanco();
  await usuario(SEMTRANSP, "semtransp");
  await usuario(M1, "motorista");
  await usuario(M2, "motorista");
  await db.query("insert into motoristas (usuario_id) values ($1), ($2)", [M1, M2]);

  const ponto = async (nome: string, ordem: number) =>
    (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ($1, 'italva', $2) returning id", [nome, ordem])).rows[0].id;
  ids.p0 = await ponto("Saída", 0);
  ids.p1 = await ponto("Praça", 1);
  ids.p2 = await ponto("Centro", 2);
  const o = (await db.query<{ id: string; qr_token: string }>(
    "insert into onibus (prefixo, placa, capacidade) values ('01', 'AAA1A11', 40) returning id, qr_token",
  )).rows[0];
  ids.on01 = o.id;
  ids.token = o.qr_token;
  ids.idaManha = (await db.query<{ id: string }>("select id from viagens_modelo where cidade = 'campos' and nome = 'Ida manhã'")).rows[0].id;
  await db.query("insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values ($1, 1, $2, $3)", [
    ids.idaManha,
    ids.on01,
    M1,
  ]);

  await aluno(A, ids.p1);
  await aluno(B, ids.p1);
  await aluno(C, ids.p2);
  await aluno(D, ids.p0);
  await aluno(E, ids.p1);

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  ids.v = (await db.query<{ id: string }>("select id from viagens_dia where viagem_modelo_id = $1 and data = '2026-10-26'", [ids.idaManha]))
    .rows[0].id;
  for (const al of [A, B, C, D]) await como(db, al, "select reservar($1)", [ids.v]);
}, 180_000);

describe("motorista", () => {
  it("a geração automática das viagens não avisa o motorista", async () => {
    expect(await total("motorista_escalado")).toBe(0);
  });

  it("reaplicar a escala com o mesmo motorista não avisa de novo", async () => {
    await como(db, SEMTRANSP, "select reaplicar_escala($1)", [ids.v]);
    expect(await total("motorista_escalado")).toBe(0);
    expect(await total("motorista_retirado")).toBe(0);
  });

  it("trocar o motorista avisa quem entra e quem sai", async () => {
    await como(db, SEMTRANSP, "update viagem_dia_onibus set motorista_id = $1 where viagem_dia_id = $2", [M2, ids.v]);
    expect((await avisos(M2, "motorista_escalado"))[0].titulo).toBe("Você foi escalado: ônibus 01");
    expect((await avisos(M2, "motorista_escalado"))[0].conteudo).toMatch(/Ida manhã · Campos · amanhã às 05:30/);
    expect(await avisos(M1, "motorista_retirado")).toHaveLength(1);
    // Volta para o M1.
    await como(db, SEMTRANSP, "update viagem_dia_onibus set motorista_id = $1 where viagem_dia_id = $2", [M1, ids.v]);
    expect(await avisos(M1, "motorista_escalado")).toHaveLength(1);
    expect(await avisos(M2, "motorista_retirado")).toHaveLength(1);
  });
});

describe("lembrete de reserva", () => {
  it("antes de faltar 1 hora para o prazo, não lembra", async () => {
    await relogio(db, "2026-10-25 17:30:00-03");
    await db.query("select lembrar_reservas()");
    expect(await total("lembrete_reserva")).toBe(0);
  });

  it("1 hora antes do prazo, lembra só quem tem a viagem liberada e não reservou", async () => {
    await relogio(db, "2026-10-25 18:01:00-03");
    await db.query("select lembrar_reservas()");
    const e = await avisos(E, "lembrete_reserva");
    expect(e).toHaveLength(1);
    expect(e[0].titulo).toBe("Reserve sua ida até as 19:00");
    expect(e[0].conteudo).toMatch(/sai às 05:30 de amanhã/);
    expect(await total("lembrete_reserva")).toBe(1);
    // Rodar de novo não repete.
    await db.query("select lembrar_reservas()");
    expect(await total("lembrete_reserva")).toBe(1);
  });

  it("quem desligou os lembretes não recebe", async () => {
    await db.query("update viagens_dia set lembrete_em = null where id = $1", [ids.v]);
    await db.query("delete from notificacoes where evento = 'lembrete_reserva'");
    await db.query("update usuarios set receber_lembretes = false where id = $1", [E]);
    await db.query("select lembrar_reservas()");
    expect(await total("lembrete_reserva")).toBe(0);
  });
});

describe("lista fechada", () => {
  it("ao fechar o prazo, o motorista recebe quantos alunos estão no ônibus dele", async () => {
    await relogio(db, "2026-10-25 19:05:00-03");
    await como(db, SEMTRANSP, "select fechar_prazos()");
    const l = await avisos(M1, "lista_fechada");
    expect(l).toHaveLength(1);
    expect(l[0].titulo).toBe("Lista fechada: 4 alunos no ônibus 01");
  });
});

describe("ônibus no ponto", () => {
  beforeAll(async () => {
    await relogio(db, "2026-10-26 05:00:00-03");
    ids.t = (await db.query<{ id: string }>("select id from viagem_dia_onibus where viagem_dia_id = $1", [ids.v])).rows[0].id;
    await como(db, M1, "select iniciar_trecho($1)", [ids.t]);
    await como(db, M1, "select enviar_localizacao($1, $2, $3, 15)", [ids.t, PERTO.lat, PERTO.lng]);
  });

  it("o 1º embarque do ponto avisa quem está no ônibus, do ponto em diante", async () => {
    await como(db, B, "select embarcar_qr($1, $2, $3)", [ids.token, PERTO.lat, PERTO.lng]);
    const a = await avisos(A, "onibus_no_ponto");
    expect(a).toEqual([{ titulo: "Ônibus 01 no ponto Praça", conteudo: "O ônibus chegou ao seu ponto. Embarque e leia o QR code." }]);
    const c = await avisos(C, "onibus_no_ponto");
    expect(c[0].conteudo).toMatch(/a caminho do seu ponto \(Centro\)/);
    // Quem é de um ponto anterior na rota e quem embarcou não recebem.
    expect(await avisos(D, "onibus_no_ponto")).toHaveLength(0);
    expect(await avisos(B, "onibus_no_ponto")).toHaveLength(0);
  });

  it("o 2º embarque do mesmo ponto não repete o aviso", async () => {
    await como(db, A, "select embarcar_qr($1, $2, $3)", [ids.token, PERTO.lat, PERTO.lng]);
    expect(await total("onibus_no_ponto")).toBe(2);
  });

  it("o próximo ponto avisa de novo (só quem ainda não embarcou)", async () => {
    await como(db, M1, "select marcar_presenca_manual($1, 'Sem bateria')", [
      (await db.query<{ id: string }>("select id from reservas where aluno_id = $1 and status = 'ativa'", [C])).rows[0].id,
    ]);
    // D é de ponto anterior: não é avisado; A e B já embarcaram.
    expect(await total("onibus_no_ponto")).toBe(2);
  });
});

describe("matrícula", () => {
  it("avisa 15 dias antes e no dia seguinte ao vencimento", async () => {
    await db.query("update alunos set matricula_validade = '2026-11-10' where usuario_id = $1", [A]);
    await db.query("update alunos set matricula_validade = '2026-10-25' where usuario_id = $1", [B]);
    expect((await db.query<{ n: number }>("select avisar_matriculas() as n")).rows[0].n).toBe(2);
    expect((await avisos(A, "matricula_vencendo"))[0].conteudo).toMatch(/10\/11\/2026/);
    expect(await avisos(B, "matricula_vencida")).toHaveLength(1);
  });
});

describe("fila do push", () => {
  it("o servidor pega cada aviso pendente uma vez só, com o perfil de quem recebe", async () => {
    const pendentes = await total("onibus_no_ponto");
    const lote = (await db.query<{ id: number; perfil: string; evento: string }>("select * from pegar_notificacoes_push(1000)")).rows;
    expect(lote.length).toBeGreaterThanOrEqual(pendentes);
    expect(lote.find((n) => n.evento === "lista_fechada")?.perfil).toBe("motorista");
    expect((await db.query("select * from pegar_notificacoes_push(1000)")).rows).toHaveLength(0);
  });

  it("aluno não chama a fila nem lê a configuração privada", async () => {
    await expect(como(db, A, "select * from pegar_notificacoes_push(10)")).rejects.toThrow();
    expect(await como(db, A, "select * from config_privada")).toHaveLength(0);
  });
});
