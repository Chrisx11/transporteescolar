/**
 * Fase 2 — reservas e operação do dia.
 * Cobre os cenários obrigatórios 1, 2, 3, 4, 5, 14 e 17 (seção 15) e as
 * permissões. O relógio é fixado com relogio() para testar os prazos.
 *
 * Calendário usado: 25/10/2026 = domingo, 26 = segunda, 27 = terça (feriado), 28 = quarta.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { como, cpfDe, criarBanco, falhaComo, relogio, uid } from "./apoio";

let db: PGlite;

const SEMTRANSP = uid("aaaaaaaa", 1);
const ALUNO_A = uid("bbbbbbbb", 1); // grade seg: ida manhã + volta tarde (UENF)
const ALUNO_D = uid("bbbbbbbb", 2); // grade seg: ida manhã
const ALUNO_C = uid("bbbbbbbb", 3); // matrícula vencida
const grupoManha = Array.from({ length: 60 }, (_, i) => uid("cccccccc", i + 1)); // ida manhã
const grupoNoite = Array.from({ length: 45 }, (_, i) => uid("dddddddd", i + 1)); // ida noite

const ids: Record<string, string> = {};
let cpf = 100000000;

async function usuario(id: string, perfil: string) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into usuarios (id, cpf, nome, perfil, troca_senha_obrigatoria) values ($1, $2, $3, $4, false)", [
    id,
    cpfDe(cpf++),
    `Usuário ${id.slice(0, 4)}`,
    perfil,
  ]);
}

async function aluno(id: string, validade: string, grade: { dia: number; ida?: string; volta?: string; pontoIda?: string }[]) {
  await usuario(id, "aluno");
  await db.query(
    "insert into alunos (usuario_id, situacao, matricula_validade, ponto_ida_padrao_id) values ($1, 'ativo', $2, $3)",
    [id, validade, ids.praca],
  );
  await db.query("insert into aluno_pontos_volta (aluno_id, cidade, ponto_id) values ($1, 'campos', $2)", [id, ids.uenfPonto]);
  for (const g of grade) {
    await db.query(
      "insert into grade_semanal (aluno_id, dia_semana, viagem_ida_modelo_id, viagem_volta_modelo_id, ponto_ida_id, instituicao_id) values ($1, $2, $3, $4, $5, $6)",
      [id, g.dia, g.ida ?? null, g.volta ?? null, g.pontoIda ?? null, ids.uenf],
    );
  }
}

const modelo = async (cidade: string, nome: string) =>
  (await db.query<{ id: string }>("select id from viagens_modelo where cidade = $1 and nome = $2", [cidade, nome])).rows[0].id;
const viagemDia = async (cidade: string, nome: string, data: string) =>
  (
    await db.query<{ id: string }>(
      "select vd.id from viagens_dia vd join viagens_modelo vm on vm.id = vd.viagem_modelo_id where vm.cidade = $1 and vm.nome = $2 and vd.data = $3",
      [cidade, nome, data],
    )
  ).rows[0]?.id;

beforeAll(async () => {
  db = await criarBanco();
  await usuario(SEMTRANSP, "semtransp");

  ids.uenf = (await db.query<{ id: string }>("insert into instituicoes (nome, cidade) values ('UENF', 'campos') returning id")).rows[0].id;
  await db.query("insert into semestres (instituicao_id, nome, inicio, fim) values ($1, '2026.2', '2026-08-01', '2026-12-20')", [ids.uenf]);
  ids.praca = (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ('Praça', 'italva', 1) returning id")).rows[0].id;
  ids.rodoviaria = (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ('Rodoviária', 'italva', 2) returning id")).rows[0].id;
  ids.uenfPonto = (await db.query<{ id: string }>("insert into pontos (nome, cidade, ordem) values ('UENF', 'campos', 1) returning id")).rows[0].id;
  ids.on01 = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('01', 'AAA1A11', 40) returning id")).rows[0].id;
  ids.on02 = (await db.query<{ id: string }>("insert into onibus (prefixo, placa, capacidade) values ('02', 'BBB2B22', 44) returning id")).rows[0].id;

  ids.idaManha = await modelo("campos", "Ida manhã");
  ids.idaNoite = await modelo("campos", "Ida noite");
  ids.voltaTarde = await modelo("campos", "Volta tarde");

  // Escala modelo de segunda: ida manhã com 2 ônibus; ida noite com 1 (40 lugares); volta tarde com o 02.
  await db.query(
    `insert into escala_modelo (viagem_modelo_id, dia_semana, onibus_id) values
       ($1, 1, $3), ($1, 1, $4), ($2, 1, $3), ($5, 1, $4)`,
    [ids.idaManha, ids.idaNoite, ids.on01, ids.on02, ids.voltaTarde],
  );

  await aluno(ALUNO_A, "2026-12-31", [
    { dia: 1, ida: ids.idaManha, volta: ids.voltaTarde },
    { dia: 2, ida: ids.idaManha },
    { dia: 3, ida: ids.idaManha },
  ]);
  await aluno(ALUNO_D, "2026-12-31", [{ dia: 1, ida: ids.idaManha }]);
  await aluno(ALUNO_C, "2026-10-20", [{ dia: 1, ida: ids.idaNoite }]);
  for (const [i, id] of grupoManha.entries()) {
    await aluno(id, "2026-12-31", [{ dia: 1, ida: ids.idaManha, pontoIda: i < 30 ? ids.praca : ids.rodoviaria }]);
  }
  for (const id of grupoNoite) await aluno(id, "2026-12-31", [{ dia: 1, ida: ids.idaNoite }]);

  // Feriado geral na terça 27/10 (cenário 14), cadastrado antes da geração.
  await db.query("insert into calendario (data, tipo, descricao) values ('2026-10-27', 'feriado', 'Feriado de teste')");

  await relogio(db, "2026-10-25 10:00:00-03");
  await como(db, SEMTRANSP, "select gerar_viagens_dia(2)");
}, 180_000);

describe("geração das viagens do dia", () => {
  it("gera segunda com a escala modelo, pula o feriado e a 20:30", async () => {
    const r = await db.query<{ data: string; n: number }>(
      "select to_char(data, 'YYYY-MM-DD') as data, count(*)::int as n from viagens_dia group by data order by data",
    );
    // domingo não tem viagem; terça é feriado
    expect(r.rows.map((x) => x.data)).toEqual(["2026-10-26"]);
    const vinteTrinta = await db.query("select 1 from viagens_dia vd join viagens_modelo vm on vm.id = vd.viagem_modelo_id where vm.condicional");
    expect(vinteTrinta.rows.length).toBe(0);
    const onibus = await db.query<{ n: number }>(
      "select count(*)::int as n from viagem_dia_onibus where viagem_dia_id = $1",
      [await viagemDia("campos", "Ida manhã", "2026-10-26")],
    );
    expect(onibus.rows[0].n).toBe(2);
  });

  it("calcula abertura e prazo em America/Sao_Paulo", async () => {
    const r = await db.query<{ abertura: string; prazo: string }>(
      `select to_char(abertura_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as abertura,
              to_char(prazo_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as prazo
         from viagens_dia where id = $1`,
      [await viagemDia("campos", "Ida manhã", "2026-10-26")],
    );
    expect(r.rows[0]).toEqual({ abertura: "25/10 00:00", prazo: "25/10 19:00" });
  });

  it("rodar de novo não duplica", async () => {
    const [{ gerar_viagens_dia }] = await como<{ gerar_viagens_dia: number }>(db, SEMTRANSP, "select gerar_viagens_dia(2)");
    expect(gerar_viagens_dia).toBe(0);
  });
});

describe("cenário 1 — só aparece o que está na grade", () => {
  it("minhas_viagens mostra a ida manhã e a volta tarde, não a ida noite", async () => {
    const r = await como<{ nome: string }>(db, ALUNO_A, "select nome from minhas_viagens('2026-10-26')");
    expect(r.map((x) => x.nome)).toEqual(["Ida manhã", "Volta tarde"]);
  });

  it("reservar viagem fora da grade é recusado", async () => {
    const erro = await falhaComo(db, ALUNO_A, "select reservar($1)", [await viagemDia("campos", "Ida noite", "2026-10-26")]);
    expect(erro).toMatch(/não está na sua grade/);
  });
});

describe("cenário 2 — ida manhã até 19:00 do dia anterior", () => {
  it("18:59 aceita; 19:01 recusa e o app mostra prazo encerrado", async () => {
    const ida = await viagemDia("campos", "Ida manhã", "2026-10-26");
    await relogio(db, "2026-10-25 18:59:00-03");
    await como(db, ALUNO_A, "select reservar($1)", [ida]);
    await relogio(db, "2026-10-25 19:01:00-03");
    expect(await falhaComo(db, ALUNO_D, "select reservar($1)", [ida])).toMatch(/prazo/);
    const [v] = await como<{ motivo: string; pode_cancelar: boolean }>(
      db,
      ALUNO_A,
      "select motivo, pode_cancelar from minhas_viagens('2026-10-26') where sentido = 'ida'",
    );
    expect(v).toEqual({ motivo: "prazo_encerrado", pode_cancelar: false });
  });
});

describe("cenário 3 — cancelar a volta tarde até 15:00", () => {
  it("14:59 cancela; 15:01 não permite", async () => {
    const volta = await viagemDia("campos", "Volta tarde", "2026-10-26");
    await relogio(db, "2026-10-26 10:00:00-03");
    const [{ reservar: r1 }] = await como<{ reservar: string }>(db, ALUNO_A, "select reservar($1)", [volta]);
    await relogio(db, "2026-10-26 14:59:00-03");
    await como(db, ALUNO_A, "select cancelar_reserva($1)", [r1]);
    const [{ reservar: r2 }] = await como<{ reservar: string }>(db, ALUNO_A, "select reservar($1)", [volta]);
    await relogio(db, "2026-10-26 15:01:00-03");
    expect(await falhaComo(db, ALUNO_A, "select cancelar_reserva($1)", [r2])).toMatch(/prazo/);
  });
});

describe("cenário 4 — 45 reservas numa ida com 40 lugares", () => {
  it("todas são aceitas (ida nunca bloqueia) e passam da capacidade", async () => {
    const noite = await viagemDia("campos", "Ida noite", "2026-10-26");
    await relogio(db, "2026-10-26 12:00:00-03");
    for (const id of grupoNoite) await como(db, id, "select reservar($1)", [noite]);
    const r = await db.query<{ reservas: number; capacidade: number }>(
      `select (select count(*)::int from reservas where viagem_dia_id = $1 and status = 'ativa') as reservas,
              (select sum(o.capacidade)::int from viagem_dia_onibus x join onibus o on o.id = x.onibus_id where x.viagem_dia_id = $1) as capacidade`,
      [noite],
    );
    expect(r.rows[0]).toEqual({ reservas: 45, capacidade: 40 });
  });
});

describe("cenário 5 — prazo fecha e aloca em dois ônibus", () => {
  it("cada ponto vai inteiro para um ônibus e todos recebem o aviso", async () => {
    const ida = await viagemDia("campos", "Ida manhã", "2026-10-26");
    await relogio(db, "2026-10-25 12:00:00-03");
    for (const id of grupoManha) await como(db, id, "select reservar($1)", [ida]);

    await relogio(db, "2026-10-25 19:05:00-03");
    await db.query("select fechar_prazos()"); // como o pg_cron (sem usuário)

    const status = await db.query<{ status: string }>("select status::text from viagens_dia where id = $1", [ida]);
    expect(status.rows[0].status).toBe("prazo_fechado");

    const porPonto = await db.query<{ ponto: string; onibus: number; total: number }>(
      `select p.nome as ponto, count(distinct r.viagem_dia_onibus_id)::int as onibus, count(*)::int as total
         from reservas r join pontos p on p.id = r.ponto_id
        where r.viagem_dia_id = $1 and r.status = 'ativa' group by p.nome order by p.nome`,
      [ida],
    );
    // Praça: 30 + aluno A = 31 no mesmo ônibus; Rodoviária: 30 no outro.
    expect(porPonto.rows).toEqual([
      { ponto: "Praça", onibus: 1, total: 31 },
      { ponto: "Rodoviária", onibus: 1, total: 30 },
    ]);
    const semOnibus = await db.query<{ n: number }>(
      "select count(*)::int as n from reservas where viagem_dia_id = $1 and status = 'ativa' and viagem_dia_onibus_id is null",
      [ida],
    );
    expect(semOnibus.rows[0].n).toBe(0);

    const avisos = await db.query<{ n: number }>(
      "select count(*)::int as n from notificacoes where evento = 'onibus_atribuido' and referencia->>'viagem_dia_id' = $1",
      [ida],
    );
    expect(avisos.rows[0].n).toBe(61);

    const [meu] = await como<{ onibus_prefixo: string }>(
      db,
      ALUNO_A,
      "select onibus_prefixo from minhas_viagens('2026-10-26') where sentido = 'ida'",
    );
    expect(["01", "02"]).toContain(meu.onibus_prefixo);
  });

  it("com excesso, distribui todos e ninguém fica sem ônibus", async () => {
    const noite = await viagemDia("campos", "Ida noite", "2026-10-26");
    await relogio(db, "2026-10-26 15:05:00-03");
    await db.query("select fechar_prazos()");
    const r = await db.query<{ n: number }>(
      "select count(*)::int as n from reservas where viagem_dia_id = $1 and status = 'ativa' and viagem_dia_onibus_id is not null",
      [noite],
    );
    expect(r.rows[0].n).toBe(45);
  });

  it("mover aluno de ônibus avisa a troca", async () => {
    const ida = await viagemDia("campos", "Ida manhã", "2026-10-26");
    const [res] = (
      await db.query<{ id: string; viagem_dia_onibus_id: string }>(
        "select id, viagem_dia_onibus_id from reservas where aluno_id = $1 and viagem_dia_id = $2 and status = 'ativa'",
        [ALUNO_A, ida],
      )
    ).rows;
    const outro = (
      await db.query<{ id: string }>("select id from viagem_dia_onibus where viagem_dia_id = $1 and id <> $2", [
        ida,
        res.viagem_dia_onibus_id,
      ])
    ).rows[0].id;
    await como(db, SEMTRANSP, "select mover_reserva($1, $2)", [res.id, outro]);
    const aviso = await db.query<{ titulo: string }>(
      "select titulo from notificacoes where usuario_id = $1 and evento = 'onibus_alterado'",
      [ALUNO_A],
    );
    expect(aviso.rows[0].titulo).toMatch(/^Seu ônibus mudou: 0[12]$/);
  });
});

describe("cenário 14 — feriado", () => {
  it("não há viagem e o app explica o motivo", async () => {
    const [v] = await como<{ motivo: string; viagem_dia_id: string | null }>(
      db,
      ALUNO_A,
      "select motivo, viagem_dia_id from minhas_viagens('2026-10-27')",
    );
    expect(v).toEqual({ motivo: "sem_operacao", viagem_dia_id: null });
  });
});

describe("cenário 17 — matrícula vencida", () => {
  it("não reserva e vê o aviso", async () => {
    const noite = await viagemDia("campos", "Ida noite", "2026-10-26");
    await relogio(db, "2026-10-26 12:00:00-03");
    expect(await falhaComo(db, ALUNO_C, "select reservar($1)", [noite])).toMatch(/matrícula estará vencida/);
    const [v] = await como<{ motivo: string }>(db, ALUNO_C, "select motivo from minhas_viagens('2026-10-26')");
    expect(v.motivo).toBe("matricula_vencida");
  });
});

describe("calendário da instituição", () => {
  it("dia sem aula da UENF bloqueia a reserva", async () => {
    await relogio(db, "2026-10-26 10:00:00-03");
    await como(db, SEMTRANSP, "select gerar_viagens_dia(2)"); // gera a quarta 28/10
    await db.query("insert into calendario (instituicao_id, data, tipo, descricao) values ($1, '2026-10-28', 'sem_aula', 'Semana acadêmica')", [
      ids.uenf,
    ]);
    const [v] = await como<{ motivo: string }>(db, ALUNO_A, "select motivo from minhas_viagens('2026-10-28')");
    expect(v.motivo).toBe("sem_aula");
  });
});

describe("permissões", () => {
  it("aluno não grava reserva direto na tabela", async () => {
    const erro = await falhaComo(db, ALUNO_D, "insert into reservas (aluno_id, viagem_dia_id) values ($1, $2)", [
      ALUNO_D,
      await viagemDia("campos", "Ida noite", "2026-10-26"),
    ]);
    expect(erro).toMatch(/row-level security/);
  });

  it("aluno não roda as rotinas de operação", async () => {
    expect(await falhaComo(db, ALUNO_D, "select fechar_prazos()")).toMatch(/permissão/);
    expect(await falhaComo(db, ALUNO_D, "select gerar_viagens_dia(2)")).toMatch(/permissão/);
  });

  it("aluno não chama a função interna de regras", async () => {
    expect(await falhaComo(db, ALUNO_D, "select motivo_bloqueio($1, $1)", [ALUNO_D])).toMatch(/permission denied/);
  });

  it("aluno vê só as próprias reservas e avisos", async () => {
    const r = await como<{ aluno_id: string }>(db, ALUNO_A, "select distinct aluno_id from reservas");
    expect(r.map((x) => x.aluno_id)).toEqual([ALUNO_A]);
    const n = await como<{ usuario_id: string }>(db, ALUNO_A, "select distinct usuario_id from notificacoes");
    expect(n.map((x) => x.usuario_id)).toEqual([ALUNO_A]);
  });

  it("depois do prazo não dá para reaplicar a escala", async () => {
    expect(
      await falhaComo(db, SEMTRANSP, "select reaplicar_escala($1)", [await viagemDia("campos", "Ida manhã", "2026-10-26")]),
    ).toMatch(/prazo está aberto/);
  });

  it("cancelar viagem avisa os reservados", async () => {
    const volta = await viagemDia("campos", "Volta tarde", "2026-10-26");
    const [{ cancelar_viagem }] = await como<{ cancelar_viagem: number }>(db, SEMTRANSP, "select cancelar_viagem($1, 'Pane no ônibus')", [
      volta,
    ]);
    expect(cancelar_viagem).toBe(1); // o aluno A
  });
});
