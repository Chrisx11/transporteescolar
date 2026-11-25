/**
 * Fase 3 — embarque.
 * Cobre os cenários obrigatórios 6, 7, 8, 9, 10 e 16 (seção 15), a troca de
 * ônibus pelo QR, o encerramento automático e as permissões.
 *
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda (dia das viagens).
 * Ida manhã de Campos sai 05:30 (QR das 04:30 às 06:00); volta tarde sai 18:15.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;

const SEMTRANSP = uid("aaaaaaaa", 1);
const M1 = uid("eeeeeeee", 1); // ônibus 01 (ida manhã e volta tarde)
const M2 = uid("eeeeeeee", 2); // ônibus 02 (ida manhã)
const A = uid("bbbbbbbb", 1); // ida manhã + volta tarde
const B = uid("bbbbbbbb", 2); // ida manhã
const E = uid("bbbbbbbb", 3); // ida manhã
const C = uid("bbbbbbbb", 4); // só volta tarde
const D = uid("bbbbbbbb", 5); // ida noite (ninguém encerra)

// Perto do ônibus (Praça de Italva) e longe (outra cidade).
const PERTO = { lat: -21.4206, lng: -41.6913 };
const PERTO_ALUNO = { lat: -21.4208, lng: -41.6915 };
const LONGE = { lat: -21.7545, lng: -41.3244 };

const ids: Record<string, string> = {};
let cpf = 300000000;

async function usuario(id: string, perfil: string) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
    id,
    cpfDe(cpf++),
    `Pessoa ${id.slice(0, 4)}-${id.slice(-2)}`,
    perfil,
  ]);
}

async function aluno(id: string, grade: { ida?: string; volta?: string }) {
  await usuario(id, "aluno");
  await db.query(
    "insert into alunos (usuario_id, situacao, matricula_validade, ponto_ida_padrao_id) values ($1, 'ativo', '2026-12-31', $2)",
    [id, ids.praca],
  );
  await db.query("insert into aluno_pontos_volta (aluno_id, cidade, ponto_id) values ($1, 'campos', $2)", [id, ids.uenfPonto]);
  await db.query(
    "insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id, viagem_volta_modelo_id) values ($1, 1, $2, $3)",
    [id, grade.ida ?? null, grade.volta ?? null],
  );
}

const modelo = async (nome: string) =>
  (await db.query<{ id: string }>("select id from viagens_modelo where cidade = 'campos' and nome = $1", [nome])).rows[0].id;
const viagem = async (modeloId: string) =>
  (await db.query<{ id: string }>("select id from viagens_dia where viagem_modelo_id = $1 and data = '2026-10-26'", [modeloId]))
    .rows[0].id;
const trecho = async (viagemId: string, onibusId: string) =>
  (await db.query<{ id: string }>("select id from viagem_dia_onibus where viagem_dia_id = $1 and onibus_id = $2", [viagemId, onibusId]))
    .rows[0].id;
const reservaDe = async (alunoId: string, viagemId: string) =>
  (await db.query<{ id: string }>("select id from reservas where aluno_id = $1 and viagem_dia_id = $2 and status = 'ativa'", [alunoId, viagemId]))
    .rows[0].id;
const resultado = async (alunoId: string, viagemId: string) =>
  (await db.query<{ resultado: string }>("select resultado from frequencia where aluno_id = $1 and viagem_dia_id = $2", [alunoId, viagemId]))
    .rows[0]?.resultado;
const qr = (alunoId: string, token: string, pos?: { lat: number; lng: number }) =>
  como<{ embarcar_qr: { ok: boolean; mensagem: string; prefixo: string; trocou_de_onibus: boolean; verificado_localizacao: boolean } }>(
    db,
    alunoId,
    "select embarcar_qr($1, $2, $3)",
    [token, pos?.lat ?? null, pos?.lng ?? null],
  ).then((r) => r[0].embarcar_qr);

beforeAll(async () => {
  db = await criarBanco();
  await usuario(SEMTRANSP, "semtransp");
  await usuario(M1, "motorista");
  await usuario(M2, "motorista");
  await db.query("insert into motoristas (usuario_id) values ($1), ($2)", [M1, M2]);

  ids.praca = (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ('Praça', 'italva', 1) returning id")).rows[0].id;
  ids.uenfPonto = (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ('UENF', 'campos', 1) returning id")).rows[0].id;
  const on = async (prefixo: string, placa: string, cap: number) =>
    (await db.query<{ id: string; qr_token: string }>(
      "insert into onibus (prefixo, placa, capacidade) values ($1, $2, $3) returning id, qr_token",
      [prefixo, placa, cap],
    )).rows[0];
  const o1 = await on("01", "AAA1A11", 2);
  const o2 = await on("02", "BBB2B22", 2);
  const o3 = await on("03", "CCC3C33", 40);
  ids.on01 = o1.id;
  ids.on02 = o2.id;
  ids.on03 = o3.id;
  ids.token01 = o1.qr_token;
  ids.token02 = o2.qr_token;
  ids.token03 = o3.qr_token;

  ids.idaManha = await modelo("Ida manhã");
  ids.voltaTarde = await modelo("Volta tarde");
  ids.idaNoite = await modelo("Ida noite");

  await db.query(
    `insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values
       ($1, 1, $3, $5), ($1, 1, $4, $6), ($2, 1, $3, $5), ($7, 1, $8, $6)`,
    [ids.idaManha, ids.voltaTarde, ids.on01, ids.on02, M1, M2, ids.idaNoite, ids.on03],
  );

  await aluno(A, { ida: ids.idaManha, volta: ids.voltaTarde });
  await aluno(B, { ida: ids.idaManha });
  await aluno(E, { ida: ids.idaManha });
  await aluno(C, { volta: ids.voltaTarde });
  await aluno(D, { ida: ids.idaNoite });

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  ids.vIda = await viagem(ids.idaManha);
  ids.vVolta = await viagem(ids.voltaTarde);
  ids.vNoite = await viagem(ids.idaNoite);
  // Ordem de reserva define a alocação: A e B no 01, E no 02.
  for (const [al, v] of [
    [A, ids.vIda],
    [B, ids.vIda],
    [E, ids.vIda],
    [A, ids.vVolta],
    [C, ids.vVolta],
    [D, ids.vNoite],
  ]) {
    await como(db, al, "select reservar($1)", [v]);
  }

  await relogio(db, "2026-10-25 19:05:00-03");
  await como(db, SEMTRANSP, "select fechar_prazos()");
  ids.t01 = await trecho(ids.vIda, ids.on01);
  ids.t02 = await trecho(ids.vIda, ids.on02);
  ids.tVolta = await trecho(ids.vVolta, ids.on01);
}, 180_000);

describe("motorista inicia a ida", () => {
  it("alocou A e B no 01 e E no 02", async () => {
    const lista = await como<{ aluno_id: string }>(db, M1, "select aluno_id from lista_embarque($1)", [ids.t01]);
    expect(lista.map((l) => l.aluno_id).sort()).toEqual([A, B].sort());
  });

  it("outro motorista não vê nem inicia a lista", async () => {
    expect(await falhaComo(db, M2, "select * from lista_embarque($1)", [ids.t01])).toMatch(/escala/);
    expect(await falhaComo(db, M2, "select iniciar_trecho($1)", [ids.t01])).toMatch(/escala/);
    expect(await falhaComo(db, A, "select * from lista_embarque($1)", [ids.t01])).toMatch(/escala/);
  });

  it("inicia e envia a localização", async () => {
    await relogio(db, "2026-10-26 05:00:00-03");
    await como(db, M1, "select iniciar_trecho($1)", [ids.t01]);
    await como(db, M1, "select enviar_localizacao($1, $2, $3, 15)", [ids.t01, PERTO.lat, PERTO.lng]);
    const v = await db.query<{ status: string }>("select status from viagens_dia where id = $1", [ids.vIda]);
    expect(v.rows[0].status).toBe("em_andamento");
  });
});

describe("leitura do QR code", () => {
  it("cenário 7 — QR lido longe do ônibus é recusado", async () => {
    expect(await falhaComo(db, A, "select embarcar_qr($1, $2, $3)", [ids.token01, LONGE.lat, LONGE.lng])).toMatch(/longe do ônibus/);
  });

  it("sem permitir a localização, com o motorista enviando posição, é recusado", async () => {
    expect(await falhaComo(db, A, "select embarcar_qr($1, null, null)", [ids.token01])).toMatch(/localização/);
  });

  it("cenário 6 — ônibus certo, no horário, perto: embarque registrado", async () => {
    const r = await qr(A, ids.token01, PERTO_ALUNO);
    expect(r.ok).toBe(true);
    expect(r.prefixo).toBe("01");
    expect(r.verificado_localizacao).toBe(true);
    // Ler de novo não duplica.
    const outra = await qr(A, ids.token01, PERTO_ALUNO);
    expect(outra.mensagem).toMatch(/já estava confirmado/);
    const n = await db.query<{ n: number }>("select count(*)::int as n from embarques");
    expect(n.rows[0].n).toBe(1);
  });

  it("fora da janela de horário é recusado", async () => {
    await relogio(db, "2026-10-26 04:00:00-03");
    expect(await falhaComo(db, B, "select embarcar_qr($1, $2, $3)", [ids.token01, PERTO.lat, PERTO.lng])).toMatch(
      /Fora do horário de embarque.*04:30.*06:00/,
    );
    await relogio(db, "2026-10-26 05:05:00-03");
  });

  it("ônibus que não faz a viagem dele: diz qual é o ônibus", async () => {
    expect(await falhaComo(db, E, "select embarcar_qr($1, null, null)", [ids.token03])).toMatch(/prefixo 02/);
  });

  it("sem reserva hoje: recusado", async () => {
    expect(await falhaComo(db, C, "select embarcar_qr($1, null, null)", [ids.token02])).toMatch(/não tem reserva/);
  });

  it("outro ônibus da viagem, lotado: recusa e diz o ônibus certo", async () => {
    // 01 tem 2 lugares e 2 alocados (A e B).
    expect(await falhaComo(db, E, "select embarcar_qr($1, $2, $3)", [ids.token01, PERTO.lat, PERTO.lng])).toMatch(
      /lotado.*prefixo 02/,
    );
  });

  it("outro ônibus da viagem, com lugar: aceita e troca a alocação", async () => {
    // 02 tem 2 lugares e só E alocado. Sem localização recente do motorista 02 → sem verificação.
    const r = await qr(B, ids.token02);
    expect(r.ok).toBe(true);
    expect(r.trocou_de_onibus).toBe(true);
    expect(r.verificado_localizacao).toBe(false);
    const e = await db.query<{ anterior: string; vdo: string }>(
      "select onibus_anterior_id as anterior, viagem_dia_onibus_id as vdo from embarques where reserva_id = $1",
      [await reservaDe(B, ids.vIda)],
    );
    expect(e.rows[0]).toEqual({ anterior: ids.t01, vdo: ids.t02 });
  });
});

describe("cenário 16 — presença manual (fila offline)", () => {
  it("exige motivo", async () => {
    const reserva = await reservaDe(E, ids.vIda);
    expect(await falhaComo(db, M2, "select marcar_presenca_manual($1, '  ')", [reserva])).toMatch(/motivo/);
  });

  it("motorista de outro ônibus não marca", async () => {
    const reserva = await reservaDe(E, ids.vIda);
    expect(await falhaComo(db, M1, "select marcar_presenca_manual($1, 'Sem bateria')", [reserva])).toMatch(/escala/);
  });

  it("reenviar a mesma presença sem internet não duplica", async () => {
    const reserva = await reservaDe(E, ids.vIda);
    const args = [reserva, "Aluno sem celular", "celular-m2-0001", "2026-10-26 05:10:00-03"];
    // Hora informada pelo celular (05:10) fica no futuro do relógio (05:05): é limitada a agora.
    const [a] = await como<{ marcar_presenca_manual: string }>(db, M2, "select marcar_presenca_manual($1, $2, $3, $4)", args);
    const [b] = await como<{ marcar_presenca_manual: string }>(db, M2, "select marcar_presenca_manual($1, $2, $3, $4)", args);
    expect(a.marcar_presenca_manual).toBe(b.marcar_presenca_manual);
    const r = await db.query<{ n: number; tipo: string }>(
      "select count(*)::int as n, min(tipo::text) as tipo from embarques where reserva_id = $1",
      [reserva],
    );
    expect(r.rows[0]).toEqual({ n: 1, tipo: "manual" });
  });
});

describe("encerramento e frequência", () => {
  it("encerrar a ida do 01 devolve o próximo trecho de volta do mesmo ônibus", async () => {
    await relogio(db, "2026-10-26 06:30:00-03");
    const [r] = await como<{ encerrar_trecho: string }>(db, M1, "select encerrar_trecho($1)", [ids.t01]);
    expect(r.encerrar_trecho).toBe(ids.tVolta);
    // O 02 ainda não encerrou: a viagem continua em andamento e sem frequência.
    const v = await db.query<{ status: string }>("select status from viagens_dia where id = $1", [ids.vIda]);
    expect(v.rows[0].status).toBe("em_andamento");
    expect(await resultado(A, ids.vIda)).toBeUndefined();
  });

  it("com o último ônibus encerrado, lança a frequência da ida", async () => {
    await como(db, M2, "select iniciar_trecho($1)", [ids.t02]);
    await como(db, M2, "select encerrar_trecho($1)", [ids.t02]);
    const v = await db.query<{ status: string }>("select status from viagens_dia where id = $1", [ids.vIda]);
    expect(v.rows[0].status).toBe("encerrada");
    expect(await resultado(A, ids.vIda)).toBe("presente");
    expect(await resultado(B, ids.vIda)).toBe("presente");
    expect(await resultado(E, ids.vIda)).toBe("presente");
  });

  it("cenários 8 e 9 — volta: quem foi na ida vira 'não retornou'; quem não foi, falta", async () => {
    await relogio(db, "2026-10-26 15:05:00-03");
    await como(db, SEMTRANSP, "select fechar_prazos()");
    await relogio(db, "2026-10-26 17:30:00-03");
    await como(db, M1, "select iniciar_trecho($1)", [ids.tVolta]);
    await relogio(db, "2026-10-26 18:30:00-03");
    await como(db, M1, "select encerrar_trecho($1)", [ids.tVolta]);
    expect(await resultado(A, ids.vVolta)).toBe("nao_retornou");
    expect(await resultado(C, ids.vVolta)).toBe("falta");
  });

  it("aluno não lê a lista do motorista nem grava embarque direto", async () => {
    const r = await falhaComo(db, A, "insert into embarques (reserva_id, tipo) values ($1, 'qr')", [await reservaDe(A, ids.vVolta)]);
    expect(r).toMatch(/row-level security|permission/i);
  });

  it("cenário 10 — ocorrência anula faltas e 'não retornou' e avisa os alunos", async () => {
    expect(await falhaComo(db, M1, "select marcar_ocorrencia($1, 'Pane')", [ids.vVolta])).toMatch(/permissão/);
    const [r] = await como<{ marcar_ocorrencia: number }>(db, SEMTRANSP, "select marcar_ocorrencia($1, 'Pane no motor')", [ids.vVolta]);
    expect(r.marcar_ocorrencia).toBe(2);
    expect(await resultado(A, ids.vVolta)).toBe("anulada");
    expect(await resultado(C, ids.vVolta)).toBe("anulada");
    const aviso = await db.query<{ n: number }>(
      "select count(*)::int as n from notificacoes where evento = 'viagem_ocorrencia' and usuario_id = $1",
      [C],
    );
    expect(aviso.rows[0].n).toBe(1);
  });

  it("aluno vê o resultado em minhas_viagens", async () => {
    const r = await como<{ sentido: string; embarcado: boolean; resultado: string }>(
      db,
      A,
      "select sentido, embarcado, resultado from minhas_viagens('2026-10-26')",
    );
    expect(r).toEqual([
      { sentido: "ida", embarcado: true, resultado: "presente" },
      { sentido: "volta", embarcado: false, resultado: "anulada" },
    ]);
  });
});

describe("encerramento automático (RN18)", () => {
  it("ida noite esquecida é encerrada 4 h depois da saída e lança falta", async () => {
    await relogio(db, "2026-10-26 20:00:00-03");
    await como(db, SEMTRANSP, "select auto_encerrar_viagens()");
    expect(await resultado(D, ids.vNoite)).toBeUndefined();

    await relogio(db, "2026-10-26 20:31:00-03");
    const [r] = await como<{ auto_encerrar_viagens: number }>(db, SEMTRANSP, "select auto_encerrar_viagens()");
    expect(r.auto_encerrar_viagens).toBeGreaterThanOrEqual(1);
    const v = await db.query<{ status: string }>("select status from viagens_dia where id = $1", [ids.vNoite]);
    expect(v.rows[0].status).toBe("encerrada");
    expect(await resultado(D, ids.vNoite)).toBe("falta");
  });

  it("aluno não roda a rotina", async () => {
    expect(await falhaComo(db, A, "select auto_encerrar_viagens()")).toMatch(/permissão/);
  });
});
