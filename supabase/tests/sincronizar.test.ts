/**
 * Mudanças na viagem modelo e na escala modelo valem também para os dias já gerados.
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda, 27/10 = terça.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, relogio, uid } from "./apoio";

let db: PGlite;
const SEMTRANSP = uid("aaaaaaaa", 1);
const ALUNO = uid("bbbbbbbb", 1);
const ids: Record<string, string> = {};

const dia = async (data: string) =>
  (
    await db.query<{ id: string; saida: string; prazo: string; status: string; nome: string }>(
      `select id, to_char(saida_em at time zone 'America/Sao_Paulo', 'HH24:MI') as saida,
              to_char(prazo_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as prazo, status::text, nome
         from viagens_dia where viagem_modelo_id = $1 and data = $2`,
      [ids.modelo, data],
    )
  ).rows[0];
const onibusDoDia = async (viagem: string) =>
  (
    await db.query<{ prefixo: string }>(
      "select o.prefixo from viagem_dia_onibus x join onibus o on o.id = x.onibus_id where x.viagem_dia_id = $1 order by 1",
      [viagem],
    )
  ).rows.map((r) => r.prefixo);

beforeAll(async () => {
  db = await criarBanco();
  for (const [id, perfil, n] of [
    [SEMTRANSP, "semtransp", 1],
    [ALUNO, "aluno", 2],
  ] as const) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
      id,
      cpfDe(400000000 + n),
      `Pessoa ${n}`,
      perfil,
    ]);
  }
  ids.on01 = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('01', 'AAA1A11', 40) returning id")).rows[0].id;
  ids.on02 = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('02', 'BBB2B22', 40) returning id")).rows[0].id;
  ids.modelo = (await db.query<{ id: string }>("select id from viagens_modelo where cidade = 'campos' and nome = 'Ida noite'")).rows[0].id;
  await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [ALUNO]);
  await db.query("insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id) values ($1, 2, $2)", [ALUNO, ids.modelo]);

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
}, 180_000);

describe("viagem modelo alterada", () => {
  it("dias já gerados recebem o novo horário, prazo e nome", async () => {
    expect(await dia("2026-10-26")).toMatchObject({ saida: "16:30", prazo: "26/10 15:00" });
    await como(db, SEMTRANSP, "update viagens_modelo set hora_saida = '10:20', prazo_hora = '10:15', nome = 'Ida teste' where id = $1", [ids.modelo]);
    expect(await dia("2026-10-26")).toMatchObject({ saida: "10:20", prazo: "26/10 10:15", nome: "Ida teste" });
    expect(await dia("2026-10-27")).toMatchObject({ saida: "10:20", prazo: "27/10 10:15" });
  });

  it("prazo empurrado para o futuro reabre a reserva", async () => {
    await relogio(db, "2026-10-26 10:16:00-03");
    await como(db, SEMTRANSP, "select fechar_prazos()");
    expect((await dia("2026-10-26")).status).toBe("prazo_fechado");
    await como(db, SEMTRANSP, "update viagens_modelo set hora_saida = '12:00', prazo_hora = '11:00' where id = $1", [ids.modelo]);
    expect(await dia("2026-10-26")).toMatchObject({ status: "agendada", saida: "12:00" });
  });

  it("escala modelo nova entra nos dias já gerados", async () => {
    const v = (await dia("2026-10-26")).id;
    expect(await onibusDoDia(v)).toEqual([]);
    await como(db, SEMTRANSP, "insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id) values ($1, 1, $2)", [ids.modelo, ids.on01]);
    expect(await onibusDoDia(v)).toEqual(["01"]);
    await como(db, SEMTRANSP, "update escala_modelo set onibus_id = $2 where viagem_modelo_id = $1 and dia_semana = 1", [ids.modelo, ids.on02]);
    expect(await onibusDoDia(v)).toEqual(["02"]);
  });

  it("dia tirado da viagem some, mas o que tem reserva ativa fica", async () => {
    await relogio(db, "2026-10-26 10:30:00-03");
    await como(db, ALUNO, "select reservar($1)", [(await dia("2026-10-27")).id]);
    // Só sábado: segunda (sem reserva) some; terça (com reserva ativa) fica.
    await como(db, SEMTRANSP, "update viagens_modelo set dias_semana = '{6}' where id = $1", [ids.modelo]);
    expect(await dia("2026-10-26")).toBeUndefined();
    expect(await dia("2026-10-27")).toBeDefined();
  });

  it("viagem nova já cria os dias", async () => {
    await como(
      db,
      SEMTRANSP,
      "insert into viagens_modelo (cidade, nome, sentido, hora_saida, prazo_tipo, prazo_hora) values ('campos', 'Teste nova', 'ida', '20:00', 'mesmo_dia', '19:00')",
    );
    const r = await db.query<{ n: number }>(
      "select count(*)::int as n from viagens_dia vd join viagens_modelo vm on vm.id = vd.viagem_modelo_id where vm.nome = 'Teste nova'",
    );
    expect(r.rows[0].n).toBe(3); // relógio na segunda 26/10: segunda, terça e quarta
  });
});
