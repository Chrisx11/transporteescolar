"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, FileCheck2, IdCard, Loader2, Paperclip, Send, UserRoundPlus, X } from "lucide-react";
import { Aviso, Botao, Campo, Entrada, Selecao, cx } from "@/components/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { mascaraCpf } from "@/lib/mascaras";
import { concluirCadastro, iniciarEnvio, type Campo as CampoArquivo, type DadosCadastro } from "./acoes";

export type Instituicao = { id: string; nome: string; cidade: "campos" | "itaperuna" };

const MAX_MB = 10;
const OUTRA = "outra";

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function FormCadastro({ instituicoes }: { instituicoes: Instituicao[] }) {
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState<"" | "campos" | "itaperuna">("");
  const [instituicao, setInstituicao] = useState("");
  const [arquivos, setArquivos] = useState<Partial<Record<CampoArquivo, File>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<"preenchendo" | "enviando" | "pronto">("preenchendo");
  const form = useRef<HTMLFormElement>(null);

  const daCidade = instituicoes.filter((i) => i.cidade === cidade);

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
    if (!arquivos.comprovante) return setErro("Anexe o comprovante da instituição (declaração ou comprovante de matrícula).");
    if (!arquivos.residencia) return setErro("Anexe o comprovante de residência.");
    const fd = new FormData(e.currentTarget);
    const dados: DadosCadastro = {
      nome: String(fd.get("nome") ?? ""),
      cpf,
      data_nascimento: String(fd.get("data_nascimento") ?? ""),
      telefone,
      email: String(fd.get("email") ?? ""),
      endereco: String(fd.get("endereco") ?? ""),
      bairro: String(fd.get("bairro") ?? ""),
      cidade,
      instituicao_id: instituicao && instituicao !== OUTRA ? instituicao : "",
      instituicao_outra: instituicao === OUTRA ? String(fd.get("instituicao_outra") ?? "") : "",
      curso: String(fd.get("curso") ?? ""),
      periodo: String(fd.get("periodo") ?? ""),
      turno: String(fd.get("turno") ?? ""),
      aceite: fd.get("aceite") === "on",
    };

    setEtapa("enviando");
    try {
      const lista = (Object.entries(arquivos) as [CampoArquivo, File][]).filter(([, f]) => f);
      const prep = await iniciarEnvio(lista.map(([campo, f]) => ({ campo, tipo: f.type, tamanho: f.size })));
      if (!prep.ok) throw new Error(prep.erro);
      const supabase = criarClienteNavegador();
      for (const env of prep.envios) {
        const f = arquivos[env.campo]!;
        const { error } = await supabase.storage.from("documentos").uploadToSignedUrl(env.path, env.token, f, { contentType: f.type });
        if (error) throw new Error("Não foi possível enviar um dos arquivos. Verifique a internet e tente de novo.");
      }
      const fim = await concluirCadastro(prep.id, dados);
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
        <h1 className="text-2xl font-bold text-slate-900">Cadastro enviado!</h1>
        <p className="text-slate-600">
          A Secretaria de Educação vai conferir seus documentos. Quando o pedido for aprovado, entre na página do aluno com
          o seu CPF. No primeiro acesso, a senha também é o seu CPF, e você cria uma senha nova.
        </p>
        <Link href="/aluno" className="text-sm font-semibold text-azul-700 hover:underline">
          Ir para a página de login
        </Link>
      </div>
    );
  }

  const enviando = etapa === "enviando";

  return (
    <form ref={form} onSubmit={enviar} className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg">
          <UserRoundPlus className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cadastro no transporte</h1>
          <p className="text-sm text-slate-500">Para quem ainda não tem acesso. Leva uns 3 minutos.</p>
        </div>
      </div>

      <Secao titulo="Seus dados">
        <Campo rotulo="Nome completo">
          <Entrada name="nome" required autoComplete="name" />
        </Campo>
        <Campo rotulo="CPF" ajuda="Digite os números e anexe a foto ou o PDF do documento (CPF, RG ou CNH com o número do CPF).">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IdCard className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Entrada
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                className="pl-10"
                required
              />
            </div>
            <Anexo campo="cpf" arquivo={arquivos.cpf} aoEscolher={escolher} rotulo="Anexar CPF" aceita="image/*,application/pdf" />
          </div>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Data de nascimento">
            <Entrada name="data_nascimento" type="date" />
          </Campo>
          <Campo rotulo="WhatsApp (com DDD)">
            <Entrada inputMode="tel" placeholder="(22) 99999-9999" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} required />
          </Campo>
        </div>
        <Campo rotulo="E-mail" ajuda="Serve para recuperar a senha.">
          <Entrada name="email" type="email" autoComplete="email" required />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Campo rotulo="Endereço">
            <Entrada name="endereco" autoComplete="street-address" />
          </Campo>
          <Campo rotulo="Bairro">
            <Entrada name="bairro" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Sua faculdade">
        <Campo rotulo="Cidade da faculdade">
          <div className="flex gap-2">
            {(["campos", "itaperuna"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCidade(c);
                  setInstituicao("");
                }}
                className={cx(
                  "h-11 flex-1 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors",
                  cidade === c ? "bg-azul-600 text-white ring-azul-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {c === "campos" ? "Campos" : "Itaperuna"}
              </button>
            ))}
          </div>
        </Campo>
        {cidade && (
          <Campo rotulo="Instituição">
            <Selecao value={instituicao} onChange={(e) => setInstituicao(e.target.value)} required>
              <option value="" disabled>
                Escolha…
              </option>
              {daCidade.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
              <option value={OUTRA}>Outra (não está na lista)</option>
            </Selecao>
          </Campo>
        )}
        {instituicao === OUTRA && (
          <Campo rotulo="Nome da instituição">
            <Entrada name="instituicao_outra" required />
          </Campo>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Curso" className="sm:col-span-3">
            <Entrada name="curso" required />
          </Campo>
          <Campo rotulo="Período">
            <Entrada name="periodo" placeholder="Ex.: 3º" />
          </Campo>
          <Campo rotulo="Turno" className="sm:col-span-2">
            <Selecao name="turno" defaultValue="" required>
              <option value="" disabled>
                Escolha…
              </option>
              <option value="manha">Manhã</option>
              <option value="tarde">Tarde</option>
              <option value="noite">Noite</option>
              <option value="integral">Integral</option>
            </Selecao>
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Documentos">
        <ItemDocumento
          titulo="Comprovante da instituição"
          texto="Declaração ou comprovante de matrícula do semestre atual (PDF ou foto)."
          obrigatorio
        >
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
        {enviando ? "Enviando documentos…" : "Enviar cadastro"}
      </Botao>
      <Link href="/aluno" className="text-center text-sm font-medium text-azul-700 hover:underline">
        Já tenho acesso
      </Link>
    </form>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function ItemDocumento({ titulo, texto, obrigatorio, children }: { titulo: string; texto: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {titulo} {obrigatorio ? <span className="text-red-600">*</span> : <span className="font-normal text-slate-400">(opcional)</span>}
        </p>
        <p className="text-xs text-slate-500">{texto}</p>
      </div>
      {children}
    </div>
  );
}

function Anexo({
  campo,
  arquivo,
  aoEscolher,
  rotulo,
  aceita,
}: {
  campo: CampoArquivo;
  arquivo?: File;
  aoEscolher: (campo: CampoArquivo, f: File | undefined) => void;
  rotulo: string;
  aceita: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        ref={entrada}
        type="file"
        accept={aceita}
        className="hidden"
        onChange={(e) => {
          aoEscolher(campo, e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        className={cx(
          "flex h-11 max-w-56 items-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition-colors",
          arquivo ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-azul-700 ring-azul-200 hover:bg-azul-50",
        )}
        title={arquivo?.name}
      >
        {arquivo ? <FileCheck2 className="size-4 shrink-0" /> : <Paperclip className="size-4 shrink-0" />}
        <span className="truncate">{arquivo ? arquivo.name : rotulo}</span>
      </button>
      {arquivo && (
        <button
          type="button"
          onClick={() => aoEscolher(campo, undefined)}
          className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Remover arquivo"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
