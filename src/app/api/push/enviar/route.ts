import { NextResponse, type NextRequest } from "next/server";
import { enviarPendentes, segredoConfere } from "@/lib/push";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Chamado pelo banco (pg_net) quando grava avisos: envia as notificações pendentes. */
export async function POST(req: NextRequest) {
  if (!(await segredoConfere(req.headers.get("x-segredo")))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  try {
    let total = { avisos: 0, entregues: 0 };
    // Até 3 lotes por chamada (avisos gravados em massa, ex.: fechamento de prazos).
    for (let i = 0; i < 3; i++) {
      const r = await enviarPendentes();
      total = { avisos: total.avisos + r.avisos, entregues: total.entregues + r.entregues };
      if (r.avisos < 300) break;
    }
    return NextResponse.json(total);
  } catch (e) {
    console.error("push", e);
    return NextResponse.json({ erro: "falha no envio" }, { status: 500 });
  }
}
