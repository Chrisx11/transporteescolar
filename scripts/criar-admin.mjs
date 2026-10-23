// Cria o primeiro usuário Administrador (depois disso, use a tela "Usuários das secretarias").
// Uso:
//   node --env-file=.env.local scripts/criar-admin.mjs <cpf> "<nome completo>" [email]
// A senha provisória é mostrada uma única vez; a troca é obrigatória no primeiro login.
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const [cpfBruto, nome, email] = process.argv.slice(2);
if (!cpfBruto || !nome) {
  console.error('Uso: node --env-file=.env.local scripts/criar-admin.mjs <cpf> "<nome>" [email]');
  process.exit(1);
}

const cpf = cpfBruto.replace(/\D/g, "");
function cpfValido(c) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const d = [...c].map(Number);
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}
if (!cpfValido(cpf)) {
  console.error("CPF inválido.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  process.exit(1);
}
const admin = createClient(url, chave, { auth: { persistSession: false } });

const letras = "abcdefghjkmnpqrstuvwxyz";
const nums = "23456789";
const l = (n) => Array.from({ length: n }, () => letras[randomInt(letras.length)]).join("");
const dg = (n) => Array.from({ length: n }, () => nums[randomInt(nums.length)]).join("");
const senha = `${l(3)}-${dg(4)}-${l(3)}`;

const { data, error } = await admin.auth.admin.createUser({
  email: email?.toLowerCase() ?? `${cpf}@login.italva.invalid`,
  password: senha,
  email_confirm: true,
  app_metadata: { perfil: "admin" },
});
if (error) {
  console.error("Erro ao criar login:", error.message);
  process.exit(1);
}

const { error: e2 } = await admin.from("usuarios").insert({
  id: data.user.id,
  cpf,
  nome,
  email: email?.toLowerCase() ?? null,
  perfil: "admin",
  troca_senha_obrigatoria: true,
});
if (e2) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error("Erro ao gravar usuário:", e2.message);
  process.exit(1);
}

console.log(`Administrador criado.\n  CPF: ${cpf}\n  Senha provisória: ${senha}`);
