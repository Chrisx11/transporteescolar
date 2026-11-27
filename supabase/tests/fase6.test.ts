/**
 * Fase 6 — relatórios, km, vencimentos da frota e auditoria por secretaria.
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda (ida manhã de Campos 05:30).
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;

const SEMEDUC = uid("aaaaaaaa", 2);
const SEMTRANSP = uid("aaaaaaaa", 1);
const ADMIN = uid("aaaaaaaa", 3);
const M1 = uid("eeeeeeee", 1);
const A = uid("bbbbbbbb", 1); // embarca
const B = uid("bbbbbbbb", 2); // falta
const C = uid("bbbbbbbb", 3); // tem rota, nunca reserva
const PERTO = { lat: -21.4206, lng: -41.6913 };
const ids: Record<string, string> = {};
let cpf = 700000000;

async function usuario(id: string, perfil: string) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
    id,
    cpfDe(cpf++),
    `Pessoa ${id.slice(-2)}`,
    perfil,
  ]);
}

beforeAll(async () => {
  db = await criarBanco();
  for (const [id, p] of [
    [SEMEDUC, "semeduc"],
    [SEMTRANSP, "semtransp"],
    [ADMIN, "admin"],
    [M1, "motorista"],
  ])
    await usuario(id, p);
  await db.query("insert into motoristas (usuario_id, cnh_validade) values ($1, '2026-11-10')", [M1]);
  const o = (await db.query<{ id: string; qr_token: string }>(
    "insert into onibus (prefixo, placa, capacidade, vistoria_validade) values ('01', 'AAA1A11', 40, '2026-10-20') returning id, qr_token",
  )).rows[0];
  ids.token = o.qr_token;
  ids.inst = (await db.query<{ id: string }>("insert into instituicoes (nome, cidade) values ('UENF', 'campos') returning id")).rows[0].id;
  ids.idaManha = (await db.query<{ id: string }>("select id from viagens_modelo where cidade = 'campos' and nome = 'Ida manhã'")).rows[0].id;
  await db.query("update viagens_modelo set km_estimado = 60, km_retorno_vazio = 60 where id = $1", [ids.idaManha]);
  await db.query("insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id, motorista_id) values ($1, 1, $2, $3)", [ids.idaManha, o.id, M1]);

  for (const [id, turno] of [
    [A, "manha"],
    [B, "manha"],
    [C, "noite"],
  ]) {
    await usuario(id, "aluno");
    await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [id]);
    await db.query("insert into aluno_viagens (aluno_id, viagem_modelo_id) values ($1, $2)", [id, ids.idaManha]);
    await db.query("insert into aluno_vinculos (aluno_id, instituicao_id, curso, turno) values ($1, $2, 'Direito', $3)", [id, ids.inst, turno]);
  }

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  ids.v = (await db.query<{ id: string }>("select id from viagens_dia where viagem_modelo_id = $1 and data = '2026-10-26'", [ids.idaManha])).rows[0].id;
  await como(db, A, "select reservar($1)", [ids.v]);
  await como(db, B, "select reservar($1)", [ids.v]);
  await relogio(db, "2026-10-25 19:05:00-03");
  await como(db, SEMTRANSP, "select fechar_prazos()");
  await relogio(db, "2026-10-26 05:00:00-03");
  ids.t = (await db.query<{ id: string }>("select id from viagem_dia_onibus where viagem_dia_id = $1", [ids.v])).rows[0].id;
  await como(db, M1, "select iniciar_trecho($1)", [ids.t]);
  await como(db, M1, "select enviar_localizacao($1, $2, $3, 15)", [ids.t, PERTO.lat, PERTO.lng]);
  await como(db, A, "select embarcar_qr($1, $2, $3)", [ids.token, PERTO.lat, PERTO.lng]);
  await como(db, M1, "select encerrar_trecho($1)", [ids.t]);
  await relogio(db, "2026-10-27 10:00:00-03");
}, 180_000);

describe("relatórios da SEMEDUC", () => {
  it("frequência: ranking com faltas primeiro", async () => {
    const r = await como<{ aluno_id: string; faltas: number; presencas: number; perc_faltas: string }>(
      db,
      SEMEDUC,
      "select aluno_id, faltas::int, presencas::int, perc_faltas from relatorio_frequencia('2026-10-01', '2026-10-31')",
    );
    expect(r.map((x) => [x.aluno_id, x.faltas, x.presencas])).toEqual([
      [B, 1, 0],
      [A, 0, 1],
    ]);
    expect(Number(r[0].perc_faltas)).toBe(100);
  });

  it("filtro por turno usa o vínculo do aluno", async () => {
    const r = await como(db, SEMEDUC, "select 1 from relatorio_frequencia('2026-10-01', '2026-10-31', null, null, 'noite')");
    expect(r).toHaveLength(0);
  });

  it("uso: quem tem rota e não reservou aparece primeiro", async () => {
    const r = await como<{ aluno_id: string; reservas: number }>(db, SEMEDUC, "select aluno_id, reservas::int from relatorio_uso('2026-10-01', '2026-10-31')");
    expect(r[0]).toEqual({ aluno_id: C, reservas: 0 });
  });

  it("SEMTRANSP e aluno não abrem relatório da Educação", async () => {
    expect(await falhaComo(db, SEMTRANSP, "select * from relatorio_frequencia('2026-10-01', '2026-10-31')")).toMatch(/Educação/);
    expect(await falhaComo(db, A, "select * from relatorio_uso('2026-10-01', '2026-10-31')")).toMatch(/Educação/);
  });
});

describe("relatórios da SEMTRANSP", () => {
  it("ocupação: 2 reservas, 1 embarcado, 40 lugares", async () => {
    const r = await como<{ viagens: number; media_reservas: string; media_embarcados: string; ocupacao: string }>(
      db,
      SEMTRANSP,
      "select viagens::int, media_reservas, media_embarcados, ocupacao from relatorio_ocupacao('2026-10-01', '2026-10-31') where viagem = 'Ida manhã' and cidade = 'campos' and dia_semana = 1",
    );
    expect(r).toHaveLength(1);
    expect([r[0].viagens, Number(r[0].media_reservas), Number(r[0].media_embarcados), Number(r[0].ocupacao)]).toEqual([1, 2, 1, 2.5]);
  });

  it("previsão: 3 alunos com a ida manhã liberada na segunda, 40 lugares escalados", async () => {
    const r = await como<{ alunos: number; capacidade: number }>(
      db,
      SEMTRANSP,
      "select alunos::int, capacidade::int from relatorio_previsao('campos') where viagem = 'Ida manhã' and dia_semana = 1",
    );
    expect(r).toEqual([{ alunos: 3, capacidade: 40 }]);
  });

  it("km: viagem realizada soma o km e o retorno vazio", async () => {
    const r = await como<{ realizadas: number; km_total: string }>(db, SEMTRANSP, "select realizadas::int, km_total from relatorio_km('2026-10-01', '2026-10-31')");
    expect(r).toHaveLength(1);
    expect([r[0].realizadas, Number(r[0].km_total)]).toEqual([1, 120]);
  });

  it("vencimentos: vistoria vencida e CNH vencendo em 14 dias", async () => {
    const r = await como<{ tipo: string; dias: number }>(db, SEMTRANSP, "select tipo, dias from vencimentos_frota()");
    expect(r).toEqual([
      { tipo: "Vistoria", dias: -7 },
      { tipo: "CNH", dias: 14 },
    ]);
  });
});

describe("auditoria por secretaria", () => {
  beforeAll(async () => {
    await como(db, SEMEDUC, "update instituicoes set endereco = 'Av. Alberto Lamego' where id = $1", [ids.inst]);
    await como(db, SEMTRANSP, "update onibus set capacidade = 42 where prefixo = '01'");
  });

  it("cada secretaria vê só as tabelas dela; o Admin vê tudo", async () => {
    const tabelas = async (quem: string) =>
      new Set((await como<{ tabela: string }>(db, quem, "select distinct tabela from auditoria")).map((x) => x.tabela));
    const educ = await tabelas(SEMEDUC);
    const transp = await tabelas(SEMTRANSP);
    const admin = await tabelas(ADMIN);
    expect(educ.has("instituicoes")).toBe(true);
    expect(educ.has("onibus")).toBe(false);
    expect(transp.has("onibus")).toBe(true);
    expect(transp.has("instituicoes")).toBe(false);
    expect(admin.has("onibus") && admin.has("instituicoes")).toBe(true);
    expect(await como(db, A, "select 1 from auditoria")).toHaveLength(0);
  });

  it("em usuários, a Educação vê alunos e os Transportes veem motoristas", async () => {
    const perfis = async (quem: string) =>
      new Set(
        (await como<{ p: string }>(db, quem, "select coalesce(depois, antes) ->> 'perfil' as p from auditoria where tabela = 'usuarios'")).map((x) => x.p),
      );
    expect([...(await perfis(SEMEDUC))]).toEqual(["aluno"]);
    expect([...(await perfis(SEMTRANSP))]).toEqual(["motorista"]);
  });
});
