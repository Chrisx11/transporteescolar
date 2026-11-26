// Importa as planilhas do sistema antigo (Google Forms) como Pedidos de passe
// "aguardando complemento". Cada aluno depois recebe um link individual
// (Educação → Pedidos de passe → Aguardando complemento) para digitar o CPF e
// anexar os documentos.
//
// Simular (não grava nada, só mostra o resumo):
//   node --env-file=.env.local scripts/importar-planilhas.mjs "planilha-campos.xlsx" "planilha-itaperuna.xlsx"
// Gravar:
//   node --env-file=.env.local scripts/importar-planilhas.mjs --gravar "planilha-campos.xlsx" "planilha-itaperuna.xlsx"
// Desfazer (apaga os pedidos importados que ainda estão aguardando):
//   node --env-file=.env.local scripts/importar-planilhas.mjs --remover
//
// A cidade de cada planilha vem do nome do arquivo (CAMPOS ou ITAPERUNA).
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { createHash, randomBytes } from "node:crypto";
import { basename } from "node:path";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const args = process.argv.slice(2);
const GRAVAR = args.includes("--gravar");
const arquivos = args.filter((a) => !a.startsWith("--"));
const DIAS_VALIDADE = 30;

const texto = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return String(v.text ?? v.hyperlink ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join("") : "")).trim();
  return String(v).trim();
};
const DIAS = { "segunda-feira": [1, "Seg"], "terça-feira": [2, "Ter"], "quarta-feira": [3, "Qua"], "quinta-feira": [4, "Qui"], "sexta-feira": [5, "Sex"], sábado: [6, "Sáb"], domingo: [7, "Dom"] };
const resumirDias = (t) =>
  t
    .split(",")
    .map((d) => DIAS[d.trim().toLowerCase()])
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0])
    .map((d) => d[1])
    .join(", ");
const turnoDaLinha = (l) => {
  const u = l.toUpperCase();
  const m = u.includes("MANHÃ");
  const n = u.includes("NOITE");
  return m && n ? "integral" : m ? "manha" : n ? "noite" : "noite";
};
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
// Mesma padronização de src/lib/formatos.ts: nome em maiúsculas e telefone (00) 00000-0000.
const nomePadrao = (n) => (n ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
function telefonePadrao(t) {
  const original = (t ?? "").trim();
  let d = original.replace(/\D/g, "");
  if (!d) return original;
  if (d.length > 13) d = d.slice(0, d.startsWith("55") ? 13 : 11);
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 9 || d.length === 8) d = "22" + d;
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return original;
}

async function lerPlanilha(arq) {
  const nome = basename(arq).toUpperCase();
  const cidade = nome.includes("ITAPERUNA") ? "itaperuna" : nome.includes("CAMPOS") ? "campos" : null;
  const tipo = nome.includes("RENOV") ? "renovação" : "inscrição";
  if (!cidade) throw new Error(`Não sei a cidade da planilha "${basename(arq)}" (o nome precisa ter CAMPOS ou ITAPERUNA).`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arq);
  const ws = wb.worksheets[0];
  const cab = ws.getRow(1).values.slice(1).map(texto);
  const col = (re) => cab.findIndex((c) => re.test(c));
  const C = {
    carimbo: col(/carimbo/i),
    linha: col(/QUAL LINHA/i),
    inst: col(/INSTITUIÇÃO/i),
    curso: col(/NOME DO SEU CURSO/i),
    nome: col(/NOME COMPLETO/i),
    tel: col(/TELEFONE/i),
    email: col(/E-MAIL/i),
    nasc: col(/NASCIMENTO/i),
    end: col(/SEU ENDEREÇO/i),
    ultimo: col(/ÚLTIMO ANO/i),
    dias: col(/DIAS DA SEMANA/i),
    opcoes: col(/ALGUMA DAS OPÇÕES/i),
    contar: col(/contar algo/i),
  };
  for (const k of ["linha", "inst", "nome", "tel", "email"]) if (C[k] < 0) throw new Error(`Coluna "${k}" não encontrada em ${basename(arq)}.`);
  const linhas = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const v = r.values.slice(1);
    const g = (i) => (i >= 0 ? texto(v[i]) : "");
    if (!g(C.nome) && !g(C.email)) return;
    const obs = [];
    if (g(C.ultimo)) obs.push(`Último ano na instituição: ${g(C.ultimo)}`);
    if (g(C.opcoes) && !/nenhuma/i.test(g(C.opcoes))) obs.push(g(C.opcoes));
    if (g(C.contar)) obs.push(`Escreveu: ${g(C.contar)}`);
    const nascCru = C.nasc >= 0 ? v[C.nasc] : null;
    linhas.push({
      arquivo: basename(arq),
      origemTexto: `${cidade === "campos" ? "Campos" : "Itaperuna"} ${tipo}`,
      carimbo: C.carimbo >= 0 && v[C.carimbo] instanceof Date ? v[C.carimbo].getTime() : n,
      cidade,
      nome: nomePadrao(g(C.nome)),
      telefone: telefonePadrao(g(C.tel)),
      email: g(C.email).toLowerCase(),
      instituicao: g(C.inst).toUpperCase(),
      curso: g(C.curso) || "A informar",
      linha: g(C.linha),
      turno: turnoDaLinha(g(C.linha)),
      dias: resumirDias(g(C.dias)),
      data_nascimento: nascCru instanceof Date ? nascCru.toISOString().slice(0, 10) : null,
      endereco: g(C.end) || null,
      observacao: obs.join(" · ") || null,
    });
  });
  return linhas;
}

async function remover() {
  const r = await s.from("pre_cadastros").delete({ count: "exact" }).eq("origem", "planilha").eq("status", "aguardando");
  if (r.error) throw r.error;
  console.log(`${r.count} pedido(s) importado(s) e ainda aguardando foram apagados.`);
}

async function importar() {
  if (!arquivos.length) throw new Error("Informe as planilhas (.xlsx).");
  const todas = (await Promise.all(arquivos.map(lerPlanilha))).flat();

  // Mesmo e-mail mais de uma vez: fica a resposta mais recente.
  const porEmail = new Map();
  const repetidos = [];
  const invalidos = [];
  for (const l of todas.sort((a, b) => b.carimbo - a.carimbo)) {
    if (!emailValido(l.email)) {
      invalidos.push(l);
      continue;
    }
    if (porEmail.has(l.email)) {
      repetidos.push(l);
      // Guarda no pedido que ficou de onde mais o aluno respondeu (a Educação decide na análise).
      const fica = porEmail.get(l.email);
      fica.outras = [...new Set([...(fica.outras ?? []), l.origemTexto])];
    } else porEmail.set(l.email, l);
  }

  // Já tem login ou pedido no sistema novo?
  const emails = [...porEmail.keys()];
  const jaExistem = new Set();
  for (let i = 0; i < emails.length; i += 200) {
    const lote = emails.slice(i, i + 200);
    const [{ data: u }, { data: p }] = await Promise.all([
      s.from("usuarios").select("email").in("email", lote),
      s.from("pre_cadastros").select("email, status").in("email", lote).neq("status", "recusado"),
    ]);
    (u ?? []).forEach((x) => jaExistem.add(x.email));
    (p ?? []).forEach((x) => jaExistem.add(x.email));
  }
  const novos = [...porEmail.values()].filter((l) => !jaExistem.has(l.email));

  // Instituições: cria as que faltam (por cidade). "OUTRO" fica a definir.
  const { data: insts } = await s.from("instituicoes").select("id, nome, cidade");
  const chave = (nome, cidade) => `${cidade}|${nome.toUpperCase()}`;
  const mapa = new Map((insts ?? []).map((i) => [chave(i.nome, i.cidade), i.id]));
  const faltando = [...new Set(novos.filter((l) => l.instituicao && l.instituicao !== "OUTRO").map((l) => chave(l.instituicao, l.cidade)))].filter((k) => !mapa.has(k));

  console.log("\n=== Resumo da importação ===");
  for (const arq of arquivos) console.log(`  ${basename(arq)}: ${todas.filter((l) => l.arquivo === basename(arq)).length} linha(s)`);
  console.log(`  e-mails repetidos (fica só a resposta mais recente): ${repetidos.length}`);
  console.log(`  e-mails inválidos (não importados): ${invalidos.length}`);
  const outraCidade = [...porEmail.values()].filter((l) => (l.outras ?? []).some((o) => !o.startsWith(l.cidade === "campos" ? "Campos" : "Itaperuna"))).length;
  console.log(`  alunos que também responderam para a outra cidade (fica a mais recente, com aviso no pedido): ${outraCidade}`);
  console.log(`  já têm login ou pedido no sistema novo (não importados): ${jaExistem.size}`);
  console.log(`  pedidos a criar: ${novos.length}  (Campos ${novos.filter((l) => l.cidade === "campos").length} · Itaperuna ${novos.filter((l) => l.cidade === "itaperuna").length})`);
  console.log(`  instituições a cadastrar: ${faltando.length}${faltando.length ? " → " + faltando.map((k) => k.replace("|", ": ")).join(", ") : ""}`);
  console.log(`  "OUTRO" (instituição a definir pela Educação): ${novos.filter((l) => l.instituicao === "OUTRO").length}`);
  console.log(`  sem curso (fica "A informar"): ${novos.filter((l) => l.curso === "A informar").length}`);

  if (!GRAVAR) {
    console.log("\nNada foi gravado (simulação). Para gravar, rode de novo com --gravar.");
    return;
  }

  for (const k of faltando) {
    const [cidade, nome] = k.split("|");
    const { data, error } = await s.from("instituicoes").insert({ nome, cidade }).select("id").single();
    if (error) throw new Error(`Instituição ${nome}: ${error.message}`);
    mapa.set(k, data.id);
  }

  const expira = new Date(Date.now() + DIAS_VALIDADE * 864e5).toISOString();
  const registros = novos.map((l) => ({
    nome: l.nome,
    telefone: l.telefone,
    email: l.email,
    cidade: l.cidade,
    instituicao_id: l.instituicao === "OUTRO" ? null : mapa.get(chave(l.instituicao, l.cidade)) ?? null,
    instituicao_outra: l.instituicao === "OUTRO" || !l.instituicao ? "A definir (OUTRO na planilha)" : null,
    curso: l.curso,
    turno: l.turno,
    linha: l.linha,
    dias: l.dias || null,
    data_nascimento: l.data_nascimento,
    endereco: l.endereco,
    observacao: [l.observacao, l.outras?.length ? `Também respondeu: ${l.outras.join(", ")} (ficou a resposta mais recente: ${l.origemTexto})` : null].filter(Boolean).join(" · ") || null,
    status: "aguardando",
    origem: "planilha",
    // O link de verdade é gerado ao enviar o e-mail ou copiar o link; este só marca o pedido como aguardando.
    codigo_hash: createHash("sha256").update(randomBytes(24)).digest("hex"),
    codigo_expira_em: expira,
  }));
  let gravados = 0;
  for (let i = 0; i < registros.length; i += 100) {
    const { error } = await s.from("pre_cadastros").insert(registros.slice(i, i + 100));
    if (error) throw new Error(`Gravação parou após ${gravados} pedido(s): ${error.message}`);
    gravados += registros.slice(i, i + 100).length;
  }
  console.log(`\nPronto: ${gravados} pedido(s) de passe criado(s) como "aguardando complemento".`);
}

if (args.includes("--remover")) await remover();
else await importar();
