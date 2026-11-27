import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { obterSessao } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { RELATORIOS, descreverFiltros, lerFiltros, type Coluna } from "@/lib/relatorios";
import { hojeSP } from "@/lib/tempo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORMATO: Partial<Record<NonNullable<Coluna["tipo"]>, string>> = {
  numero: "#,##0",
  decimal: "#,##0.0",
  perc: '0.0"%"',
  data: "dd/mm/yyyy",
};

/** Baixa o relatório em Excel (.xlsx), com os mesmos filtros da tela. */
export async function GET(req: NextRequest) {
  const sessao = await obterSessao();
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rel = RELATORIOS.find((r) => r.chave === sp.r);
  if (!sessao || sessao.troca_senha_obrigatoria) return NextResponse.json({ erro: "Entre novamente." }, { status: 401 });
  if (!rel || rel.perfil !== sessao.perfil) return NextResponse.json({ erro: "Relatório não encontrado." }, { status: 404 });

  const filtros = lerFiltros(sp);
  const supabase = await criarClienteServidor();
  let instituicaoNome: string | undefined;
  if (filtros.instituicao) {
    const { data } = await supabase.from("instituicoes").select("nome").eq("id", filtros.instituicao).maybeSingle();
    instituicaoNome = data?.nome;
  }
  let linhas;
  try {
    linhas = await rel.carregar(supabase, filtros);
  } catch {
    return NextResponse.json({ erro: "Não foi possível gerar o relatório." }, { status: 500 });
  }

  const livro = new ExcelJS.Workbook();
  livro.creator = "Transporte Universitário de Italva";
  livro.created = new Date();
  const folha = livro.addWorksheet(rel.titulo.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });
  const n = rel.colunas.length;

  folha.mergeCells(1, 1, 1, n);
  folha.getCell(1, 1).value = `${rel.titulo} — Prefeitura de Italva`;
  folha.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
  folha.mergeCells(2, 1, 2, n);
  folha.getCell(2, 1).value = [descreverFiltros(rel, filtros, instituicaoNome), `Gerado em ${hojeSP().split("-").reverse().join("/")}`, `${linhas.length} linha(s)`]
    .filter(Boolean)
    .join(" · ");
  folha.getCell(2, 1).font = { size: 10, color: { argb: "FF64748B" } };

  const cab = folha.getRow(4);
  rel.colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.rotulo;
    cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cel.alignment = { vertical: "middle", wrapText: true };
    folha.getColumn(i + 1).width = c.largura ?? 14;
    if (c.tipo && FORMATO[c.tipo]) folha.getColumn(i + 1).numFmt = FORMATO[c.tipo]!;
  });
  cab.height = 30;

  const valor = (c: Coluna, v: string | number | null) => {
    if (v === null || v === undefined || v === "") return null;
    if (c.tipo === "data") return new Date(`${v}T12:00:00Z`);
    if (c.tipo && c.tipo !== "texto") return Number(v);
    return String(v);
  };
  linhas.forEach((l, i) => {
    const row = folha.getRow(5 + i);
    rel.colunas.forEach((c, j) => (row.getCell(j + 1).value = valor(c, l[c.chave] ?? null)));
  });
  if (rel.totais && linhas.length) {
    const t = rel.totais(linhas);
    const row = folha.getRow(5 + linhas.length);
    rel.colunas.forEach((c, j) => {
      if (t[c.chave] !== undefined) row.getCell(j + 1).value = valor(c, t[c.chave]);
    });
    row.font = { bold: true };
  }
  if (linhas.length) folha.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + linhas.length, column: n } };

  const buffer = await livro.xlsx.writeBuffer();
  const nome = `relatorio-${rel.chave}-${hojeSP()}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
