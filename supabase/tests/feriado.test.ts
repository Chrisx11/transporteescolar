/**
 * Dia sem transporte lançado depois que as viagens já foram geradas.
 * Calendário: 25/10/2026 = domingo, 26/10 = segunda, 27/10 = terça.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, relogio, uid } from "./apoio";

let db: PGlite;
const SEMTRANSP = uid("aaaaaaaa", 1);
const SEMEDUC = uid("aaaaaaaa", 2);
const A = uid("bbbbbbbb", 1); // estuda na UENF
const B = uid("bbbbbbbb", 2); // sem faculdade cadastrada
let uenf = "";

const viagem = async (nome: string, data: string) =>
  (
    await db.query<{ id: string; status: string }>(
      "select vd.id, vd.status from viagens_dia vd join viagens_modelo m on m.id = vd.viagem_modelo_id where m.cidade = 'campos' and m.nome = $1 and vd.data = $2",
      [nome, data],
    )
  ).rows[0];
const reserva = async (aluno: string, viagemId: string) =>
  (await db.query<{ status: string }>("select status from reservas where aluno_id = $1 and viagem_dia_id = $2", [aluno, viagemId])).rows[0]?.status;
const avisos = async (aluno: string) =>
  (await db.query<{ titulo: string }>("select titulo from notificacoes where usuario_id = $1 order by criado_em", [aluno])).rows.map((r) => r.titulo);

beforeAll(async () => {
  db = await criarBanco();
  let n = 800000000;
  for (const [id, perfil] of [
    [SEMTRANSP, "semtransp"],
    [SEMEDUC, "semeduc"],
    [A, "aluno"],
    [B, "aluno"],
  ] as const) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, 'Pessoa', $3, false)", [id, cpfDe(n++), perfil]);
    if (perfil === "aluno") {
      await db.query("insert into alunos (usuario_id, situacao, matricula_validade) values ($1, 'ativo', '2026-12-31')", [id]);
      await db.query("insert into aluno_viagens (aluno_id, viagem_modelo_id) select $1, id from viagens_modelo where cidade = 'campos' and nome = 'Ida noite'", [id]);
    }
  }
  uenf = (await db.query<{ id: string }>("insert into instituicoes (nome, cidade) values ('UENF', 'campos') returning id")).rows[0].id;
  await db.query("insert into aluno_vinculos (aluno_id, instituicao_id, curso, turno) values ($1, $2, 'Eng.', 'noite')", [A, uenf]);

  await relogio(db, "2026-10-26 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
  for (const al of [A, B]) {
    await como(db, al, "select reservar($1)", [(await viagem("Ida noite", "2026-10-26")).id]);
    await como(db, al, "select reservar($1)", [(await viagem("Ida noite", "2026-10-27")).id]);
  }
}, 180_000);

describe("dia sem transporte lançado depois", () => {
  it("dia sem aula da UENF cancela só a reserva de quem estuda lá, com aviso", async () => {
    await como(db, SEMEDUC, "insert into calendario (instituicao_id, data, tipo, descricao) values ($1, '2026-10-27', 'sem_aula', 'Semana acadêmica')", [uenf]);
    const v = await viagem("Ida noite", "2026-10-27");
    expect(v.status).toBe("agendada");
    expect(await reserva(A, v.id)).toBe("cancelada");
    expect(await reserva(B, v.id)).toBe("ativa");
    expect(await avisos(A)).toContain("Reserva cancelada: Ida noite");
  });

  it("feriado geral cancela as viagens do dia e avisa os reservados", async () => {
    await como(db, SEMEDUC, "insert into calendario (data, tipo, descricao) values ('2026-10-26', 'feriado', 'Feriado municipal')");
    const v = await viagem("Ida noite", "2026-10-26");
    expect(v.status).toBe("cancelada");
    expect(await avisos(B)).toContain("Viagem cancelada: Ida noite");
  });

  it("viagem cancelada pelo feriado não gera falta no encerramento automático", async () => {
    await relogio(db, "2026-10-27 08:00:00-03");
    await como(db, SEMTRANSP, "select auto_encerrar_viagens()");
    const v = await viagem("Ida noite", "2026-10-26");
    const f = await db.query("select 1 from frequencia where viagem_dia_id = $1", [v.id]);
    expect(f.rows.length).toBe(0);
  });
});
