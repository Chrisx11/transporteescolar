"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ClipboardCheck, IdCard, Loader2, Send } from "lucide-react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { mascaraCpf } from "@/lib/mascaras";
import { Anexo, ItemDocumento, Secao } from "../../cadastro/form-cadastro";
import type { Campo as CampoArquivo } from "../../cadastro/acoes";
import { concluirComplemento, iniciarEnvioCodigo } from "../acoes";

type Pedido = {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  instituicao: string;
  curso: string;
  endereco: string;
  bairro: string;
  data_nascimento: string;
};

const MAX_MB = 10;

export function FormCompletar({ codigo, pedido }: { codigo: string; pedido: Pedido }) {
  const [cpf, setCpf] = useState("");
  const [arquivos, setArquivos] = useState<Partial<Record<CampoArquivo, File>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<"preenchendo" | "enviando" | "pronto">("preenchendo");

  function escolher(campo: CampoArquivo, f: File | undefined) {
    setErro(null);
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setErro(`O arquivo "${f.name}" passa de ${MAX_MB} MB. Tire uma foto com menos qualidade ou envie em PDF.`);
      return;
    }
    setArquivos((a) => ({ ...a, [campo]: f }));
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    if (!arquivos.cpf) return setErro("Anexe a foto ou o PDF do CPF.");
    if (!arquivos.comprovante) return setErro("Anexe o comprovante de matrícula.");
    if (!arquivos.residencia) return setErro("Anexe o comprovante de residência.");
    const fd = new FormData(e.currentTarget);
    setEtapa("enviando");
    try {
      const lista = (Object.entries(arquivos) as [CampoArquivo, File][]).filter(([, f]) => f);
      const prep = await iniciarEnvioCodigo(codigo, lista.map(([campo, f]) => ({ campo, tipo: f.type, tamanho: f.size })));
      if (!prep.ok) throw new Error(prep.erro);
      const supabase = criarClienteNavegador();
      for (const env of prep.envios) {
        const f = arquivos[env.campo]!;
        const { error } = await supabase.storage.from("documentos").uploadToSignedUrl(env.path, env.token, f, { contentType: f.type, upsert: true });
        if (error) throw new Error("Não foi possível enviar um dos arquivos. Verifique a internet e tente de novo.");
      }
      const fim = await concluirComplemento(codigo, {
        cpf,
        data_nascimento: String(fd.get("data_nascimento") ?? ""),
        endereco: String(fd.get("endereco") ?? ""),
        bairro: String(fd.get("bairro") ?? ""),
        aceite: fd.get("aceite") === "on",
      });
      if (!fim.ok) throw new Error(fim.erro);
      setEtapa("pronto");
    } catch (err) {
      setErro((err as Error).message || "Não foi possível enviar. Tente de novo.");
      setEtapa("preenchendo");
    }
  }

  if (etapa === "pronto") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="size-10" />
        </span>
        <h1 className="text-2xl font-bold text-slate-900">Pedido completo!</h1>
        <p className="text-slate-600">
          A Secretaria de Educação vai conferir seus documentos. Quando o pedido for aprovado, entre na página do aluno com o
          seu CPF. No primeiro acesso, a senha também é o seu CPF, e você cria uma senha nova.
        </p>
        <Link href="/aluno" className="text-sm font-semibold text-azul-700 hover:underline">
          Ir para a página do aluno
        </Link>
      </div>
    );
  }

  const enviando = etapa === "enviando";
  const primeiroNome = pedido.nome.split(" ")[0];

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-azul-500 to-azul-700 text-white shadow-lg">
          <ClipboardCheck className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Olá, {primeiroNome}!</h1>
          <p className="text-sm text-slate-500">Complete seu pedido de passe do transporte universitário.</p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-100">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Seus dados no sistema antigo</p>
        <p className="font-semibold text-slate-900">{pedido.nome}</p>
        <p className="text-slate-600">
          {pedido.instituicao} ({pedido.cidade}) · {pedido.curso}
        </p>
        <p className="text-slate-600">
          {pedido.email} · {pedido.telefone}
        </p>
        <p className="mt-2 text-xs text-slate-500">Se algo estiver errado, avise a Secretaria de Educação depois de enviar.</p>
      </div>

      <Secao titulo="Complete seus dados">
        <Campo rotulo="CPF" ajuda="Digite os números e anexe a foto ou o PDF do documento (CPF, RG ou CNH com o número do CPF).">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IdCard className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Entrada inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} className="pl-10" required />
            </div>
            <Anexo campo="cpf" arquivo={arquivos.cpf} aoEscolher={escolher} rotulo="Anexar CPF" aceita="image/*,application/pdf" />
          </div>
        </Campo>
        <Campo rotulo="Data de nascimento">
          <Entrada name="data_nascimento" type="date" defaultValue={pedido.data_nascimento} required />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Campo rotulo="Endereço">
            <Entrada name="endereco" defaultValue={pedido.endereco} autoComplete="street-address" required />
          </Campo>
          <Campo rotulo="Bairro">
            <Entrada name="bairro" defaultValue={pedido.bairro} />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Documentos">
        <ItemDocumento titulo="Comprovante de matrícula 2026" texto="Declaração ou comprovante de matrícula da sua instituição (PDF ou foto)." obrigatorio>
          <Anexo campo="comprovante" arquivo={arquivos.comprovante} aoEscolher={escolher} rotulo="Anexar comprovante" aceita="image/*,application/pdf" />
        </ItemDocumento>
        <ItemDocumento
          titulo="Comprovante de residência"
          texto="Conta de luz, água, telefone ou internet recente, no seu nome ou de alguém da família (PDF ou foto)."
          obrigatorio
        >
          <Anexo campo="residencia" arquivo={arquivos.residencia} aoEscolher={escolher} rotulo="Anexar comprovante" aceita="image/*,application/pdf" />
        </ItemDocumento>
        <ItemDocumento titulo="Foto do rosto" texto="Foto recente, de frente (ajuda o motorista a conferir o embarque).">
          <Anexo campo="foto" arquivo={arquivos.foto} aoEscolher={escolher} rotulo="Anexar foto" aceita="image/*" />
        </ItemDocumento>
        <p className="text-xs text-slate-500">PDF, JPG, PNG ou WEBP, até {MAX_MB} MB cada.</p>
      </Secao>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="aceite" required className="mt-0.5 size-4 accent-azul-600" />
        Autorizo a Prefeitura de Italva a usar meus dados e documentos somente para o cadastro e a organização do
        transporte universitário.
      </label>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Botao type="submit" disabled={enviando} className="h-12 text-base">
        {enviando ? <Loader2 className="animate-spin" /> : <Send />}
        {enviando ? "Enviando documentos…" : "Enviar pedido"}
      </Botao>
    </form>
  );
}
