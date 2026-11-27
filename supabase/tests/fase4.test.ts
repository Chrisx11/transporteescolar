/**
 * Fase 4 — volta 20:30 de Itaperuna (seção 9). Cenários obrigatórios 11, 12 e 13.
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda, 27/10 = terça.
 * Volta noite de Itaperuna (22:00, prazo 15:00) com dois ônibus: I1 (3 lugares, motorista M1)
 * e I2 (2 lugares, motorista M2). M3 não está escalado em Itaperuna.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;
const SEMTRANSP = uid("aaaaaaaa", 1);
const M1 = uid("eeeeeeee", 1);
const M2 = uid("eeeeeeee", 2);
const M3 = uid("eeeeeeee", 3);
const A = [1, 2, 3, 4, 5].map((n) => uid("bbbbbbbb", n)); // A[4] não reserva a 22:00
const ids: Record<string, string> = {};

const v22 = async (data: string) =>
  (
    await db.query<{ id: string }>(
      "select vd.id from viagens_dia vd join viagens_modelo m on m.id = vd.viagem_modelo_id where m.cidade = 'itaperuna' and m.nome = 'Volta noite' and vd.data = $1",
      [data],
    )
  ).rows[0].id;
const v2030 = async (data: string) =>
  (
    await db.query<{ id: string; status: string }>(
      "select vd.id, vd.status from viagens_dia vd join viagens_modelo m on m.id = vd.viagem_modelo_id where m.nome = 'Volta 20:30' and vd.data = $1",
      [data],
    )
  ).rows[0];
const statusReserva = async (aluno: string, viagem: string) =>
  (await db.query<{ status: string }>("select status from reservas where aluno_id = $1 and viagem_dia_id = $2 order by criada_em desc limit 1", [aluno, viagem]))
    .rows[0]?.status;
const info = async (quem: string) => (await como<{ info_volta_2030: Record<string, unknown> }>(db, quem, "select info_volta_2030()"))[0].info_volta_2030;

async function reservarTodas22(data: string) {
  const id = await v22(data);
  for (const al of A.slice(0, 4)) await como(db, al, "select reservar($1)", [id]);
}

beforeAll(async () => {
  db = await criarBanco();
  let n = 900000000;
  const pessoa = async (id: string, perfil: string) => {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [id, cpfDe(n++), `Pessoa ${n}`, perfil]);
  };
  await pessoa(SEMTRANSP, "semtransp");
  for (const m of [M1, M2, M3]) {
    await pessoa(m, "motorista");
    await db.query("insert into motoristas (usuario_id) values ($1)", [m]);
  }
  for (const al of A) {
    await pessoa(al, "aluno");
    await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [al]);
    await db.query("insert into aluno_viagens (aluno_id, viagem_modelo_id) select $1, id from viagens_modelo where cidade = 'itaperuna' and nome = 'Volta noite'", [al]);
  }
  const on = async (prefixo: string, placa: string, cap: number) =>
    (await db.query<{ id: string; qr_token: string }>("insert into onibus (prefixo, placa, capacidade) values ($1, $2, $3) returning id, qr_token", [prefixo, placa, cap])).rows[0];
  const i1 = await on("I1", "III1I11", 3);
  const i2 = await on("I2", "III2I22", 2);
  ids.i1 = i1.id;
  ids.i2 = i2.id;
  ids.token1 = i1.qr_token;
  await db.query(
    `insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id)
     select m.id, d, o, mot from viagens_modelo m, unnest(array[1, 2]) d, (values ($1::uuid, $3::uuid), ($2::uuid, $4::uuid)) as e(o, mot)
      where m.cidade = 'itaperuna' and m.nome = 'Volta noite'`,
    [ids.i1, ids.i2, M1, M2],
  );
  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  await relogio(db, "2026-10-26 10:00:00-03");
  await reservarTodas22("2026-10-26");
}, 180_000);

describe("liberação pelo motorista", () => {
  it("de manhã (lista das 22:00 ainda aberta) não libera", async () => {
    expect(await falhaComo(db, M1, "select liberar_volta_2030($1, 2)", [ids.i1])).toMatch(/a partir das 18:30/);
  });

  it("motorista que não está em Itaperuna não libera", async () => {
    await relogio(db, "2026-10-26 15:05:00-03");
    await como(db, SEMTRANSP, "select fechar_prazos()");
    expect(await falhaComo(db, M3, "select liberar_volta_2030($1, 2)", [ids.i1])).toMatch(/escalado em Itaperuna/);
  });

  it("antes das 18:30 não libera (2 horas antes da saída)", async () => {
    await relogio(db, "2026-10-26 18:20:00-03");
    expect(await falhaComo(db, M1, "select liberar_volta_2030($1, 2)", [ids.i1])).toMatch(/a partir das 18:30/);
    expect((await info(M1)).motivo).toMatch(/a partir das 18:30/);
  });

  it("mostra o mínimo sugerido: os que ficam precisam levar todos às 22:00", async () => {
    await relogio(db, "2026-10-26 18:40:00-03");
    const i = await info(M1);
    expect(i.reservas_22).toBe(4);
    expect(i.capacidade_22).toBe(5);
    const onibus = i.onibus as { prefixo: string; minimo: number; fica: number }[];
    // I1 sai (3 lugares): fica o I2 com 2 → mínimo 2. I2 sai: fica o I1 com 3 → mínimo 1.
    expect(onibus.find((o) => o.prefixo === "I1")).toMatchObject({ minimo: 2, fica: 2 });
    expect(onibus.find((o) => o.prefixo === "I2")).toMatchObject({ minimo: 1, fica: 3 });
  });

  it("recusa mínimo abaixo do necessário e libera com o mínimo certo", async () => {
    expect(await falhaComo(db, M1, "select liberar_volta_2030($1, 1)", [ids.i1])).toMatch(/entre 2 e 3/);
    await como(db, M1, "select liberar_volta_2030($1, 2)", [ids.i1]);
  });

  it("cenário 13: segundo motorista não libera de novo", async () => {
    expect(await falhaComo(db, M2, "select liberar_volta_2030($1, 1)", [ids.i2])).toMatch(/já foi liberada/);
  });
});

describe("reserva e confirmação (cenário 11)", () => {
  it("só quem tem a volta das 22:00 reserva a 20:30", async () => {
    expect(await falhaComo(db, A[4], "select reservar_volta_2030()")).toMatch(/só para quem tem reserva na volta das 22:00/);
  });

  it("enquanto não confirma, continua na 22:00 e pode desistir", async () => {
    const r = await como<{ reservar_volta_2030: { confirmada: boolean; faltam: number } }>(db, A[0], "select reservar_volta_2030()");
    expect(r[0].reservar_volta_2030).toEqual({ confirmada: false, faltam: 1 });
    expect(await statusReserva(A[0], await v22("2026-10-26"))).toBe("ativa");
    await como(db, A[0], "select desistir_volta_2030()");
    await como(db, A[0], "select reservar_volta_2030()");
  });

  it("ao atingir o mínimo: confirma, cria a 20:30 com o I1 e libera a 22:00 dos confirmados", async () => {
    const r = await como<{ reservar_volta_2030: { confirmada: boolean } }>(db, A[1], "select reservar_volta_2030()");
    expect(r[0].reservar_volta_2030.confirmada).toBe(true);
    const nova = await v2030("2026-10-26");
    expect(nova.status).toBe("prazo_fechado");
    const id22 = await v22("2026-10-26");
    expect(await statusReserva(A[0], id22)).toBe("cancelada");
    expect(await statusReserva(A[1], id22)).toBe("cancelada");
    expect(await statusReserva(A[0], nova.id)).toBe("ativa");
    const lista = await como<{ aluno_id: string }>(db, M1, "select aluno_id from lista_embarque((select id from viagem_dia_onibus where viagem_dia_id = $1))", [nova.id]);
    expect(lista.map((l) => l.aluno_id).sort()).toEqual([A[0], A[1]].sort());
  });

  it("o I1 sai da 22:00 e quem ficou vai para o I2", async () => {
    const id22 = await v22("2026-10-26");
    const onibus = await db.query<{ onibus_id: string }>("select onibus_id from viagem_dia_onibus where viagem_dia_id = $1", [id22]);
    expect(onibus.rows.map((o) => o.onibus_id)).toEqual([ids.i2]);
    const sem = await db.query("select 1 from reservas where viagem_dia_id = $1 and status = 'ativa' and viagem_dia_onibus_id is null", [id22]);
    expect(sem.rows.length).toBe(0);
  });

  it("o botão some: depois de confirmada, ninguém mais reserva", async () => {
    expect(await falhaComo(db, A[2], "select reservar_volta_2030()")).toMatch(/já fechou as vagas/);
  });

  it("aparece na tela do aluno e o QR vale desde a confirmação (antes das 19:30)", async () => {
    const minhas = await como<{ nome: string; onibus_prefixo: string }>(db, A[0], "select nome, onibus_prefixo from minhas_viagens('2026-10-26')");
    expect(minhas.find((m) => m.nome === "Volta 20:30")?.onibus_prefixo).toBe("I1");
    await relogio(db, "2026-10-26 18:50:00-03");
    const r = await como<{ embarcar_qr: { ok: boolean } }>(db, A[0], "select embarcar_qr($1)", [ids.token1]);
    expect(r[0].embarcar_qr.ok).toBe(true);
  });
});

describe("não completou até as 20:00 (cenário 12)", () => {
  it("às 20:00 cancela, avisa e todos continuam na 22:00", async () => {
    await relogio(db, "2026-10-27 10:00:00-03");
    await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
    await reservarTodas22("2026-10-27");
    await relogio(db, "2026-10-27 15:05:00-03");
    await como(db, SEMTRANSP, "select fechar_prazos()");
    await relogio(db, "2026-10-27 18:40:00-03");
    await como(db, M2, "select liberar_volta_2030($1, 2)", [ids.i1]);
    await como(db, A[0], "select reservar_volta_2030()");

    // Depois das 20:00 ninguém reserva nem desiste.
    await relogio(db, "2026-10-27 20:01:00-03");
    expect(await falhaComo(db, A[1], "select reservar_volta_2030()")).toMatch(/fecharam às 20:00/);
    expect(await falhaComo(db, A[0], "select desistir_volta_2030()")).toMatch(/fecharam às 20:00/);
    await como(db, SEMTRANSP, "select encerrar_liberacoes_2030()");
    const l = await db.query<{ status: string }>("select status from liberacoes_2030 where data = '2026-10-27'");
    expect(l.rows[0].status).toBe("cancelada");
    expect(await v2030("2026-10-27")).toBeUndefined();
    expect(await statusReserva(A[0], await v22("2026-10-27"))).toBe("ativa");
    const aviso = await db.query("select 1 from notificacoes where usuario_id = $1 and evento = 'volta_2030_cancelada'", [A[0]]);
    expect(aviso.rows.length).toBe(1);
  });
});
