// Popula o sistema com dados FICTÍCIOS para ver como fica a operação:
// instituições, pontos (4 linhas), um ônibus e um motorista por rota (T01–T08),
// escala semanal, ~50 alunos ativos com rotas liberadas, reservas de hoje e amanhã já distribuídas nos ônibus.
//
// Tudo fica marcado para sair depois:
//   nomes com "(teste)", ônibus com prefixo "T", pessoas com CPF começando em 98.
//
// Criar:   node --env-file=.env.local scripts/dados-ficticios.mjs
// Remover: node --env-file=.env.local scripts/dados-ficticios.mjs --remover
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ok = (r, o) => {
  if (r.error) throw new Error(`${o}: ${r.error.message}`);
  return r.data;
};
const PREFIXO_CPF = "98";
const MARCA = " (teste)";

function cpfDe(n) {
  const d = (PREFIXO_CPF + String(n).padStart(7, "0")).split("").map(Number);
  for (const k of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < k; i++) soma += d[i] * (k + 1 - i);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
const senha = () => Array.from({ length: 16 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(31)]).join("");
const sorteio = (lista) => lista[randomInt(lista.length)];

// ---------------------------------------------------------------------
// Remover
// ---------------------------------------------------------------------
async function remover() {
  const pessoas = ok(await s.from("usuarios").select("id").like("cpf", `${PREFIXO_CPF}%`), "pessoas");
  for (const p of pessoas) ok(await s.auth.admin.deleteUser(p.id), "apagar login");
  const onibusT = ok(await s.from("onibus").select("id").like("prefixo", "T%"), "ônibus").map((o) => o.id);
  if (onibusT.length) {
    ok(await s.from("escala_modelo").delete().in("onibus_id", onibusT), "escala");
    ok(await s.from("viagem_dia_onibus").delete().in("onibus_id", onibusT), "escala do dia");
    ok(await s.from("onibus").delete().in("id", onibusT), "ônibus");
  }
  ok(await s.from("pontos").delete().like("nome", `%${MARCA}`), "pontos");
  ok(await s.from("instituicoes").delete().like("nome", `%${MARCA}`), "instituições");
  console.log(`Dados fictícios removidos: ${pessoas.length} pessoas, ${onibusT.length} ônibus, pontos e instituições "(teste)".`);
}

// ---------------------------------------------------------------------
// Criar
// ---------------------------------------------------------------------
const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Karen", "Lucas",
  "Mariana", "Nicolas", "Olívia", "Pedro", "Rafaela", "Samuel", "Tatiane", "Vinícius", "Yasmin", "Arthur", "Beatriz", "Caio",
  "Débora", "Enzo", "Fernanda", "Gustavo", "Helena", "Igor", "Júlia", "Kauã", "Letícia", "Matheus", "Natália", "Otávio",
  "Paula", "Renan", "Sofia", "Thiago"];
const SOBRENOMES = ["Silva", "Souza", "Oliveira", "Pereira", "Lima", "Carvalho", "Ribeiro", "Almeida", "Rocha", "Martins", "Costa", "Barbosa"];

async function criarPessoa(n, nome, perfil) {
  const cpf = cpfDe(n);
  const u = ok(
    await s.auth.admin.createUser({
      email: `${cpf}@login.italva.invalid`,
      password: senha(),
      email_confirm: true,
      app_metadata: { perfil },
    }),
    "login",
  ).user;
  ok(
    await s.from("usuarios").insert({
      id: u.id,
      cpf,
      nome,
      perfil,
      telefone: `(22) 9${String(80000000 + n).slice(0, 4)}-${String(n).padStart(4, "0")}`,
      troca_senha_obrigatoria: false,
    }),
    "usuário",
  );
  return u.id;
}

async function criar() {
  const ja = ok(await s.from("usuarios").select("id").like("cpf", `${PREFIXO_CPF}%`).limit(1), "conferir");
  if (ja.length) throw new Error("Já existem dados fictícios. Rode com --remover antes de criar de novo.");

  // Instituições
  const inst = {};
  for (const [chave, nome, cidade] of [
    ["uenf", "UENF", "campos"],
    ["iff", "IFF Campos Centro", "campos"],
    ["redentor", "UNIRedentor", "itaperuna"],
    ["famesc", "FAMESC Itaperuna", "itaperuna"],
  ]) {
    inst[chave] = ok(await s.from("instituicoes").insert({ nome: nome + MARCA, cidade }).select("id").single(), "instituição").id;
  }

  // Pontos (4 linhas)
  const pontos = { italvaCampos: [], italvaIta: [], campos: [], ita: [] };
  const ponto = async (grupo, nome, cidade, linha, ordem) =>
    pontos[grupo].push(ok(await s.from("pontos").insert({ nome: nome + MARCA, cidade, linha, ordem }).select("id").single(), "ponto").id);
  await ponto("italvaCampos", "Praça da Matriz", "italva", "campos", 1);
  await ponto("italvaCampos", "Rodoviária de Italva", "italva", "campos", 2);
  await ponto("italvaCampos", "Trevo da BR-356", "italva", "campos", 3);
  await ponto("italvaIta", "Praça São José", "italva", "itaperuna", 1);
  await ponto("italvaIta", "Bairro Cidade Nova", "italva", "itaperuna", 2);
  await ponto("italvaIta", "Posto da Saída", "italva", "itaperuna", 3);
  await ponto("campos", "Portão da UENF", "campos", "campos", 1);
  await ponto("campos", "IFF Centro", "campos", "campos", 2);
  await ponto("campos", "Pelinca", "campos", "campos", 3);
  await ponto("ita", "UNIRedentor", "itaperuna", "itaperuna", 1);
  await ponto("ita", "Centro de Itaperuna", "itaperuna", "itaperuna", 2);

  // Rotas usadas (pelos nomes das viagens modelo cadastradas). Cada rota de ida tem um ônibus.
  const modelos = ok(await s.from("viagens_modelo").select("id, cidade, nome, dias_semana").eq("ativa", true), "modelos");
  const m = (cidade, nome) => {
    const x = modelos.find((v) => v.cidade === cidade && v.nome === nome);
    if (!x) throw new Error(`Viagem modelo não encontrada: ${cidade} · ${nome}`);
    return x;
  };
  // [cidade, ida, volta, ônibus da ida, alunos, instituições, turno]
  const ROTAS = [
    ["campos", "CAMPOS NOITE 28 DE MARÇO", "CAMPOS VOLTA NOITE", "T01", 9, ["uenf", "iff"], "noite"],
    ["campos", "CAMPOS NOITE CENTRO", "CAMPOS VOLTA NOITE", "T02", 9, ["uenf", "iff"], "noite"],
    ["campos", "CAMPOS ALTERNATIVO", "CAMPOS VOLTA TARDE", "T03", 6, ["uenf", "iff"], "tarde"],
    ["itaperuna", "ONIBUS UNIG", "VOLTA NOITE 22:00", "T04", 6, ["redentor", "famesc"], "noite"],
    ["itaperuna", "ONIBUS REDENTOR E IPE", "VOLTA NOITE 22:00", "T05", 6, ["redentor"], "noite"],
    ["itaperuna", "ONIBUS FUNDAÇÃO E SENAI", "VOLTA NOITE 22:00", "T06", 5, ["famesc"], "noite"],
    ["itaperuna", "ONIBUS IFF", "VOLTA NOITE 22:00", "T07", 5, ["redentor", "famesc"], "noite"],
    ["itaperuna", "ONIBUS ALTERNATIVO", "VOLTA 18:30", "T08", 4, ["redentor", "famesc"], "tarde"],
  ];

  // Ônibus e motoristas (um por rota de ida)
  const bus = {};
  const mot = {};
  const nomesMot = ["Carlos Mendes", "Roberto Faria", "Sérgio Nunes", "Márcio Teixeira", "Paulo Vieira", "André Campos", "Jorge Ramos", "Wagner Dias"];
  for (const [i, rota] of ROTAS.entries()) {
    const prefixo = rota[3];
    bus[prefixo] = ok(
      await s.from("onibus").insert({ prefixo, placa: `TST${i + 1}A0${i + 1}`, capacidade: [40, 44, 32][i % 3] }).select("id").single(),
      "ônibus",
    ).id;
    const id = await criarPessoa(9000 + i, `${nomesMot[i]}${MARCA}`, "motorista");
    ok(await s.from("motoristas").insert({ usuario_id: id, cnh_categoria: "D", cnh_validade: "2028-06-30" }), "motorista");
    mot[prefixo] = id;
  }

  // Alunos ativos com as rotas liberadas (ida + volta da rota)
  const cursos = ["Engenharia", "Direito", "Enfermagem", "Pedagogia", "Administração", "Medicina Veterinária", "Sistemas de Informação"];
  const alunos = [];
  let n = 0;
  for (const [cidade, ida, volta, , qtd, insts, turno] of ROTAS) {
    const mIda = m(cidade, ida);
    const mVolta = m(cidade, volta);
    for (let k = 0; k < qtd; k++, n++) {
      const nome = `${NOMES[n % NOMES.length]} ${SOBRENOMES[n % SOBRENOMES.length]} ${SOBRENOMES[(n * 5 + 3) % SOBRENOMES.length]}${MARCA}`;
      const id = await criarPessoa(1000 + n, nome, "aluno");
      ok(await s.from("alunos").insert({ usuario_id: id, situacao: "ativo", matricula_validade: "2026-12-31", bairro: "Centro" }), "aluno");
      ok(await s.from("aceites_termo").insert({ usuario_id: id, versao: "1.0" }), "termo");
      ok(
        await s.from("aluno_vinculos").insert({ aluno_id: id, instituicao_id: inst[sorteio(insts)], curso: sorteio(cursos), periodo: `${1 + (n % 8)}º`, turno }),
        "vínculo",
      );
      ok(await s.from("aluno_viagens").insert([{ aluno_id: id, viagem_modelo_id: mIda.id }, { aluno_id: id, viagem_modelo_id: mVolta.id }]), "rotas");
      alunos.push({ id, cidade, ida: mIda.id, volta: mVolta.id });
    }
  }

  // Reservas de hoje e amanhã (≈85% reservam), com pontos agrupados (pesos desiguais).
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const amanha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + 864e5));
  const viagensDia = ok(
    await s.from("viagens_dia").select("id, viagem_modelo_id, data, status, sentido, cidade").in("data", [hoje, amanha]).in("status", ["agendada", "prazo_fechado"]),
    "viagens do dia",
  );
  const pesado = (lista) => lista[[0, 0, 0, 1, 1, 2][randomInt(6)] % lista.length];
  const reservas = [];
  for (const v of viagensDia) {
    for (const a of alunos.filter((x) => x.ida === v.viagem_modelo_id || x.volta === v.viagem_modelo_id)) {
      if (randomInt(100) >= 85) continue;
      const italva = a.cidade === "campos" ? pontos.italvaCampos : pontos.italvaIta;
      const fac = a.cidade === "campos" ? pontos.campos : pontos.ita;
      reservas.push({
        aluno_id: a.id,
        viagem_dia_id: v.id,
        ponto_id: v.sentido === "ida" ? pesado(italva) : pesado(fac),
        ponto_desembarque_id: v.sentido === "ida" ? pesado(fac) : pesado(italva),
      });
    }
  }
  if (reservas.length) ok(await s.from("reservas").insert(reservas), "reservas");

  // Escala semanal: cada ônibus faz a ida da sua rota e a volta correspondente,
  // nos dias em que a viagem opera. O gatilho já põe os ônibus nas viagens de hoje e amanhã.
  const escala = [];
  const jaNaVolta = new Set();
  for (const [cidade, ida, volta, prefixo] of ROTAS) {
    const mIda = m(cidade, ida);
    const mVolta = m(cidade, volta);
    for (const dia of mIda.dias_semana) {
      escala.push({ viagem_modelo_id: mIda.id, dia_semana: dia, onibus_id: bus[prefixo], motorista_id: mot[prefixo] });
    }
    for (const dia of mVolta.dias_semana) {
      const chave = `${prefixo}-${mVolta.id}-${dia}`;
      if (jaNaVolta.has(chave)) continue;
      jaNaVolta.add(chave);
      escala.push({ viagem_modelo_id: mVolta.id, dia_semana: dia, onibus_id: bus[prefixo], motorista_id: mot[prefixo] });
    }
  }
  ok(await s.from("escala_modelo").insert(escala), "escala");

  // Distribui os alunos nos ônibus agora (agrupando por ponto), para ver a logística.
  let distribuidas = 0;
  for (const v of viagensDia) {
    const r = await s.rpc("alocar_viagem", { p_viagem: v.id });
    if (!r.error) distribuidas++;
  }

  console.log(
    `Pronto: 4 instituições, 11 pontos, ${ROTAS.length} ônibus e motoristas (T01–T0${ROTAS.length}), ${alunos.length} alunos, ` +
      `${reservas.length} reservas em ${viagensDia.length} viagens de hoje e amanhã (${distribuidas} distribuídas nos ônibus).`,
  );
}

if (process.argv.includes("--remover")) await remover();
else await criar();
