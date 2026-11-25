"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { obterDispositivo } from "@/lib/device";

/** Extrai o token de um link do QR (https://<app>/embarque/<token>). */
function tokenDoQR(texto: string): string | null {
  try {
    const url = new URL(texto);
    const m = url.pathname.match(/^\/embarque\/([A-Za-z0-9_-]+)\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function LeitorQRCode() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(true);

  useEffect(() => {
    const leitor = obterDispositivo().leitorQR;
    let ativo = true;
    (async () => {
      if (!(await leitor.disponivel())) {
        setErro("Este celular não permite usar a câmera aqui. Abra a câmera do celular e aponte para o QR do ônibus.");
        setLendo(false);
        return;
      }
      while (ativo && video.current) {
        let texto: string | null;
        try {
          texto = await leitor.ler(video.current);
        } catch {
          setErro("Não foi possível abrir a câmera. Permita o acesso à câmera para este site.");
          setLendo(false);
          return;
        }
        if (!ativo || !texto) return;
        const token = tokenDoQR(texto);
        if (token) {
          router.push(`/embarque/${token}`);
          return;
        }
        setErro("Este QR code não é de um ônibus do transporte. Aponte para o adesivo dentro do ônibus.");
      }
    })();
    return () => {
      ativo = false;
      leitor.parar();
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white p-4 shadow-elevada">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <Camera className="size-5 text-azul-600" /> Aponte para o QR code do ônibus
        </p>
        <p className="mt-1 text-sm text-slate-500">O adesivo fica dentro do ônibus, perto da porta.</p>
      </div>
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-900">
        <video ref={video} className="size-full object-cover" muted playsInline />
        {lendo && !erro && (
          <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
        )}
        {lendo && !erro && (
          <p className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="size-4 animate-spin" /> Procurando o QR code…
          </p>
        )}
        {!lendo && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <CameraOff className="size-12" />
          </div>
        )}
      </div>
      {erro && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{erro}</p>}
      <Link href="/app" className="text-center text-sm font-medium text-azul-700">
        Voltar
      </Link>
    </div>
  );
}
