// Cria dados de TESTE no Supabase para experimentar a operação do dia:
// instituição, pontos, 2 ônibus, 1 motorista, 1 aluno com grade, escala modelo,
// e aplica a escala nas viagens já geradas. Tudo marcado com "(teste)".
// As senhas geradas são gravadas em dados-teste.local.md (fora do git).
//
// Uso:   node --env-file=.env.local scripts/dados-teste.mjs
// Remover: node --env-file=.env.local scripts/dados-teste.mjs --remover
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ok = (r, o) => {
  if (r.error) throw new Error(`${o}: ${r.error.message}`);
  return r.data;
};

function cpfDe(base) {
  const d = String(base).padStart(9, "0").split("").map(Number);
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += d[i] * (n + 1 - i);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}
const senha = () => {
  const l = "abcdefghjkmnpqrstuvwxyz";
  const pick = (n, a) => Array.from({ length: n }, () => a[randomInt(a.length)]).join("");
  return `${pick(3, l)}-${pick(4, "23456789")}-${pick(3, l)}`;
};

const ALUNO_CPF = cpfDe(900000001);
const MOTORISTA_CPF = cpfDe(900000002);

async function removerUsuario(cpf) {
  const { data } = await s.from("usuarios").select("id").eq("cpf", cpf).maybeSingle();
  if (data) await s.auth.admin.deleteUser(data.id);
}

if (process.argv.includes("--remover")) {
  await removerUsuario(ALUNO_CPF);
  await removerUsuario(MOTORISTA_CPF);
  await s.from("escala_modelo").delete().in("onibus_id", (await s.from("onibus").select("id").like("prefixo", "T0%")).data.map((o) => o.id));
  await s.from("viagem_dia_onibus").delete().in("onibus_id", (await s.from("onibus").select("id").like("prefixo", "T0%")).data.map((o) => o.id));
  await s.from("onibus").delete().like("prefixo", "T0%");
  await s.from("pontos").delete().like("nome", "%(teste)");
  await s.from("instituicoes").delete().like("nome", "%(teste)");
  console.log("Dados de teste removidos.");
  process.exit(0);
}

async function criarLogin(cpf, nome, perfil, telefone) {
  await removerUsuario(cpf);
  const pass = senha();
  const u = ok(
    await s.auth.admin.createUser({ email: `${cpf}@login.italva.invalid`, password: pass, email_confirm: true, app_metadata: { perfil } }),
    "login",
  ).user;
  ok(await s.from("usuarios").insert({ id: u.id, cpf, nome, perfil, telefone, troca_senha_obrigatoria: false }), "usuario");
  return { id: u.id, senha: pass };
}

const inst = ok(
  await s.from("instituicoes").upsert({ nome: "UENF (teste)", cidade: "campos", endereco: "Av. Alberto Lamego" }, { onConflict: "nome,cidade" }).select().single(),
  "instituicao",
);
await s.from("semestres").delete().eq("instituicao_id", inst.id);
ok(await s.from("semestres").insert({ instituicao_id: inst.id, nome: "2026.2", inicio: "2026-08-01", fim: "2026-12-20" }), "semestre");

const ponto = async (nome, cidade, ordem) =>
  ok(await s.from("pontos").upsert({ nome, cidade, ordem }, { onConflict: "nome,cidade" }).select().single(), nome).id;
const praca = await ponto("Praça da Matriz (teste)", "italva", 1);
await ponto("Rodoviária (teste)", "italva", 2);
const uenf = await ponto("Portão da UENF (teste)", "campos", 1);

const onibus = async (prefixo, placa, capacidade) =>
  ok(await s.from("onibus").upsert({ prefixo, placa, capacidade, situacao: "ativo" }, { onConflict: "prefixo" }).select().single(), prefixo).id;
const t01 = await onibus("T01", "TST1A01", 40);
const t02 = await onibus("T02", "TST2B02", 44);

const motorista = await criarLogin(MOTORISTA_CPF, "Motorista Teste", "motorista", "(22) 99999-0002");
ok(await s.from("motoristas").insert({ usuario_id: motorista.id, cnh_categoria: "D", cnh_validade: "2028-01-31" }), "motorista");

const aluno = await criarLogin(ALUNO_CPF, "Aluno Teste", "aluno", "(22) 99999-0001");
ok(
  await s.from("alunos").insert({
    usuario_id: aluno.id,
    situacao: "ativo",
    matricula_validade: "2026-12-31",
    ponto_ida_padrao_id: praca,
    bairro: "Centro",
  }),
  "aluno",
);
ok(await s.from("aluno_pontos_volta").insert({ aluno_id: aluno.id, cidade: "campos", ponto_id: uenf }), "ponto volta");
ok(await s.from("aceites_termo").insert({ usuario_id: aluno.id, versao: "1.0" }), "termo");
ok(await s.from("aluno_vinculos").insert({ aluno_id: aluno.id, instituicao_id: inst.id, curso: "Engenharia (teste)", periodo: "3º", turno: "noite" }), "vínculo");

const modelos = ok(await s.from("viagens_modelo").select("id, nome").eq("cidade", "campos"), "modelos");
const m = (nome) => modelos.find((x) => x.nome === nome).id;

// Grade: segunda a sábado, ida noite + volta noite (Campos).
for (let dia = 1; dia <= 6; dia++) {
  ok(
    await s.from("grade_semanal").upsert(
      { aluno_id: aluno.id, dia_semana: dia, viagem_ida_modelo_id: m("Ida noite"), viagem_volta_modelo_id: m("Volta noite"), instituicao_id: inst.id },
      { onConflict: "aluno_id,dia_semana" },
    ),
    "grade",
  );
}

// Escala modelo de segunda a sábado: T01 + motorista na ida noite e na volta noite; T02 extra na ida noite.
await s.from("escala_modelo").delete().in("onibus_id", [t01, t02]);
for (let dia = 1; dia <= 6; dia++) {
  ok(
    await s.from("escala_modelo").insert([
      { viagem_modelo_id: m("Ida noite"), dia_semana: dia, onibus_id: t01, motorista_id: motorista.id },
      { viagem_modelo_id: m("Ida noite"), dia_semana: dia, onibus_id: t02 },
      { viagem_modelo_id: m("Volta noite"), dia_semana: dia, onibus_id: t01, motorista_id: motorista.id },
    ]),
    "escala",
  );
}

// Aplica a escala nas viagens já geradas que ainda estão com prazo aberto.
const abertas = ok(await s.from("viagens_dia").select("id").eq("status", "agendada").eq("cidade", "campos"), "abertas");
let aplicadas = 0;
for (const v of abertas) {
  const r = await s.rpc("reaplicar_escala", { p_viagem: v.id });
  if (!r.error) aplicadas += r.data ?? 0;
}

writeFileSync(
  "dados-teste.local.md",
  `# Acessos de TESTE (não versionado)

Criados por \`scripts/dados-teste.mjs\` em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
Remover tudo: \`node --env-file=.env.local scripts/dados-teste.mjs --remover\`

| Perfil | Página | CPF | Senha |
|---|---|---|---|
| Aluno | /login/aluno | ${ALUNO_CPF} | ${aluno.senha} |
| Motorista | /login/motorista | ${MOTORISTA_CPF} | ${motorista.senha} |
`,
);
console.log(`Dados de teste criados. ${aplicadas} ônibus aplicados nas viagens abertas. Acessos em dados-teste.local.md`);
