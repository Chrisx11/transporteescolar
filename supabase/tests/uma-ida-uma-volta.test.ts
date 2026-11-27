/**
 * Uma ida e uma volta por dia, e a volta sai depois da ida.
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda (dia das viagens).
 * Campos: ida manhã 05:30, ida noite 16:30, volta 12:00, volta noite 22:00.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;
const SEMTRANSP = uid("aaaaaaaa", 1);
const A = uid("bbbbbbbb", 1);
const B = uid("bbbbbbbb", 2);
const C = uid("bbbbbbbb", 3);
const v: Record<string, string> = {};

const viagem = async (nome: string) =>
  (
    await db.query<{ id: string }>(
      "select vd.id from viagens_dia vd join viagens_modelo m on m.id = vd.viagem_modelo_id where m.cidade = 'campos' and m.nome = $1 and vd.data = '2026-10-26'",
      [nome],
    )
  ).rows[0].id;

beforeAll(async () => {
  db = await criarBanco();
  let n = 700000000;
  for (const [id, perfil] of [
    [SEMTRANSP, "semtransp"],
    [A, "aluno"],
    [B, "aluno"],
    [C, "aluno"],
  ] as const) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, 'Pessoa', $3, false)", [id, cpfDe(n++), perfil]);
    if (perfil === "aluno") {
      await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [id]);
      await db.query(
        "insert into aluno_viagens (aluno_id, viagem_modelo_id) select $1, id from viagens_modelo where cidade = 'campos' and nome in ('Ida manhã', 'Ida noite', 'Volta 12:00', 'Volta noite')",
        [id],
      );
    }
  }
  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  for (const nome of ["Ida manhã", "Ida noite", "Volta 12:00", "Volta noite"]) v[nome] = await viagem(nome);
}, 180_000);

describe("uma ida e uma volta por dia", () => {
  it("com uma ida reservada, não reserva outra ida no mesmo dia", async () => {
    await como(db, A, "select reservar($1)", [v["Ida manhã"]]);
    expect(await falhaComo(db, A, "select reservar($1)", [v["Ida noite"]])).toMatch(/já reservou a ida manhã/);
  });

  it("reserva a volta depois da ida, mas não uma segunda volta", async () => {
    await como(db, A, "select reservar($1)", [v["Volta 12:00"]]);
    expect(await falhaComo(db, A, "select reservar($1)", [v["Volta noite"]])).toMatch(/já reservou a volta 12:00/);
  });

  it("reservar de novo a mesma viagem (trocar pontos) continua permitido", async () => {
    await como(db, A, "select reservar($1)", [v["Ida manhã"]]);
  });

  it("depois de cancelar, pode escolher outro horário", async () => {
    const r = await como<{ id: string }>(db, A, "select id from reservas where aluno_id = $1 and viagem_dia_id = $2 and status = 'ativa'", [A, v["Volta 12:00"]]);
    await como(db, A, "select cancelar_reserva($1)", [r[0].id]);
    await como(db, A, "select reservar($1)", [v["Volta noite"]]);
  });

  it("a volta não pode sair antes da ida", async () => {
    await como(db, B, "select reservar($1)", [v["Ida noite"]]);
    expect(await falhaComo(db, B, "select reservar($1)", [v["Volta 12:00"]])).toMatch(/sai antes da sua ida \(16:30\)/);
  });

  it("a ida não pode sair depois da volta", async () => {
    await como(db, C, "select reservar($1)", [v["Volta 12:00"]]);
    expect(await falhaComo(db, C, "select reservar($1)", [v["Ida noite"]])).toMatch(/sai depois da sua volta \(12:00\)/);
  });
});
