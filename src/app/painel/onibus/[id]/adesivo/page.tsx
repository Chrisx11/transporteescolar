import type { Metadata } from "next";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AcaoRapida } from "@/components/formulario";
import { BotaoLink } from "@/components/ui";
import { BotaoImprimir } from "./botao-imprimir";
import { regenerarQr } from "../../acoes";

export const metadata: Metadata = { title: "Adesivo do QR" };

/** Endereço público do app (o link gravado no QR). */
async function origemApp() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export default async function PaginaAdesivo({ params }: { params: Promise<{ id: string }> }) {
  await exigirPerfil("semtransp");
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: onibus } = await supabase.from("onibus").select("id, prefixo, placa, qr_token").eq("id", id).maybeSingle();
  if (!onibus) notFound();

  const link = `${await origemApp()}/embarque/${onibus.qr_token}`;
  const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 1 });

  return (
    <>
      <div className="nao-imprimir mb-6 flex flex-wrap items-center gap-3">
        <BotaoLink variante="secundario" href="/painel/onibus">
          <ArrowLeft /> Voltar
        </BotaoLink>
        <BotaoImprimir />
        <AcaoRapida
          acao={regenerarQr}
          campos={{ id: onibus.id }}
          rotulo="Gerar QR novo"
 icone={<RefreshCw />}
          confirmar="O adesivo atual vai parar de funcionar. Continuar?"
        />
      </div>
      <p className="nao-imprimir mb-4 text-sm text-slate-600">
        Imprima e cole o adesivo dentro do ônibus, num lugar fácil de ver na entrada. Se o adesivo for
        fotografado e espalhado, gere um QR novo.
      </p>

      <div className="mx-auto w-[10cm] rounded-2xl border-4 border-azul-700 bg-white p-6 text-center print:border-black">
        <p className="text-sm font-semibold uppercase tracking-wide text-azul-700">Transporte Universitário · Italva</p>
        <p className="mt-1 text-4xl font-black">ÔNIBUS {onibus.prefixo}</p>
        <div className="mx-auto my-4 w-[7cm]" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-lg font-bold">Leia para confirmar seu embarque</p>
        <p className="mt-1 text-xs text-slate-500">Placa {onibus.placa}</p>
      </div>
      <p className="nao-imprimir mt-4 break-all text-center text-xs text-slate-400">{link}</p>
    </>
  );
}
