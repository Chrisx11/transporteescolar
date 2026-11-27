"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Camera, IdCard, Loader2, Lock, Mail, Phone, Save, UserRound } from "lucide-react";
import { Botao, Campo, Entrada } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { mascaraTelefone } from "@/app/(auth)/cadastro/form-cadastro";
import { iniciarEnvioFoto, salvarContato, salvarFoto } from "./acoes";

/** Reduz a foto no próprio celular (lado maior até 800 px, JPEG): envio rápido mesmo com sinal fraco. */
async function reduzirFoto(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo).catch(() => null);
  if (!imagem) return arquivo;
  const escala = Math.min(1, 800 / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext("2d")?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? arquivo), "image/jpeg", 0.85));
}

function CampoTravado({ rotulo, valor, icone: Icone }: { rotulo: string; valor: string; icone: typeof Lock }) {
  return (
    <Campo rotulo={rotulo}>
      <div className="relative">
        <Icone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Entrada value={valor} readOnly disabled className="h-12 bg-slate-50 pl-10 pr-10 text-base text-slate-600" />
        <Lock className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
      </div>
    </Campo>
  );
}

export function FormMeusDados(props: { nome: string; cpf: string; telefone: string; email: string; foto: string | null }) {
  const router = useRouter();
  const [telefone, setTelefone] = useState(mascaraTelefone(props.telefone));
  const [email, setEmail] = useState(props.email);
  const [foto, setFoto] = useState(props.foto);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvando, iniciar] = useTransition();
  const seletor = useRef<HTMLInputElement>(null);
  const mudou = telefone !== mascaraTelefone(props.telefone) || email.trim().toLowerCase() !== props.email;

  async function trocarFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return toast.error("Escolha uma foto (JPG, PNG ou WEBP).");
    setEnviandoFoto(true);
    try {
      const blob = await reduzirFoto(arquivo);
      const tipo = blob.type || arquivo.type;
      const prep = await iniciarEnvioFoto(tipo, blob.size);
      if (!prep.ok) throw new Error(prep.erro);
      const { error } = await criarClienteNavegador().storage.from("fotos").uploadToSignedUrl(prep.path, prep.token, blob, { contentType: tipo });
      if (error) throw new Error("Não foi possível enviar a foto. Verifique a internet e tente de novo.");
      const r = await salvarFoto(prep.path);
      if (!r.ok) throw new Error(r.erro);
      setFoto(URL.createObjectURL(blob));
      toast.success("Foto atualizada. É ela que o motorista vê na lista de embarque.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviandoFoto(false);
      if (seletor.current) seletor.current.value = "";
    }
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarContato({ telefone, email });
      if (r.ok) {
        toast.success(r.mensagem);
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  const iniciais = props.nome.trim().split(/\s+/);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-elevada">
        <Link href="/app" className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Meu cadastro</p>
          <p className="font-semibold text-slate-900">Meus dados</p>
        </div>
      </div>

      <section className="flex flex-col items-center gap-3 rounded-3xl bg-white p-6 shadow-suave">
        <button
          type="button"
          onClick={() => seletor.current?.click()}
          disabled={enviandoFoto}
          className="group relative size-28 overflow-hidden rounded-full ring-4 ring-azul-50"
          aria-label="Trocar foto"
        >
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="Sua foto" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center bg-gradient-to-br from-azul-400 to-azul-700 text-3xl font-bold uppercase text-white">
              {(iniciais[0]?.[0] ?? "") + (iniciais.length > 1 ? iniciais[iniciais.length - 1][0] : "")}
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 flex h-9 items-center justify-center bg-slate-900/55 text-white">
            {enviandoFoto ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </span>
        </button>
        <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => void trocarFoto(e.target.files?.[0])} />
        <button type="button" onClick={() => seletor.current?.click()} disabled={enviandoFoto} className="text-sm font-semibold text-azul-700">
          {enviandoFoto ? "Enviando foto…" : foto ? "Trocar foto" : "Colocar foto"}
        </button>
        <p className="text-center text-xs text-slate-500">Use uma foto do rosto, de frente: o motorista confere na hora do embarque.</p>
      </section>

      <form onSubmit={salvar} className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-suave">
        <CampoTravado rotulo="Nome" valor={props.nome} icone={UserRound} />
        <CampoTravado rotulo="CPF" valor={props.cpf} icone={IdCard} />
        <p className="-mt-2 flex items-start gap-1.5 text-xs text-slate-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" /> Para corrigir nome ou CPF, procure a Secretaria de Educação.
        </p>

        <Campo rotulo="Telefone (WhatsApp)">
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Entrada
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(22) 99999-9999"
              className="h-12 pl-10 text-base"
              required
            />
          </div>
        </Campo>
        <Campo rotulo="E-mail" ajuda="Usado para recuperar a senha.">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Entrada
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="seu@email.com"
              className="h-12 pl-10 text-base"
            />
          </div>
        </Campo>

        <Botao type="submit" disabled={salvando || !mudou} className="h-12 text-base">
          {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações
        </Botao>
      </form>
    </div>
  );
}
