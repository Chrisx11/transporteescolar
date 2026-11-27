"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, IdCard, KeyRound, Loader2, LogIn, Phone } from "lucide-react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { mascaraCpf } from "@/lib/mascaras";

/**
 * Primeiro acesso: o aluno digita só o CPF. O sistema entra com a primeira
 * senha (o próprio CPF) e leva direto para criar a senha nova.
 */
export function FormPrimeiroAcesso() {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [telefone4, setTelefone4] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [porNascimento, setPorNascimento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const digitos = cpf.replace(/\D/g, "");
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf: digitos,
          senha: digitos,
          perfil: "aluno",
          ...(porNascimento ? { nascimento } : { telefone4 }),
        }),
      });
      const corpo = await r.json();
      if (r.ok) {
        router.replace(corpo.destino);
        router.refresh();
        return;
      }
      if (r.status === 429 || r.status === 400 || corpo.primeiroAcesso) setErro(corpo.erro);
      else
        setErro(
          "Não foi possível fazer o primeiro acesso com este CPF. Se você já criou sua senha, entre pela página do aluno. " +
            "Se o seu pedido de passe ainda não foi aprovado, aguarde a Secretaria de Educação.",
        );
      setEnviando(false);
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg">
          <KeyRound className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Primeiro acesso</h1>
          <p className="text-sm text-slate-500">Seu pedido de passe foi aprovado? Comece por aqui.</p>
        </div>
      </div>

      <ol className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-100">
        <li>1. Digite o seu CPF e os 4 últimos números do seu telefone, e toque em Entrar.</li>
        <li>2. Crie a sua senha (com letras e números).</li>
        <li>3. Nas próximas vezes, entre pela página do aluno com o CPF e a sua senha.</li>
      </ol>

      <Campo rotulo="CPF">
        <div className="relative">
          <IdCard className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Entrada
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            className="h-12 pl-10 text-base"
            required
          />
        </div>
      </Campo>

      {porNascimento ? (
        <Campo rotulo="Data de nascimento">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Entrada type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className="h-12 pl-10 text-base" required />
          </div>
        </Campo>
      ) : (
        <Campo rotulo="4 últimos números do seu telefone" ajuda="O telefone (WhatsApp) que você informou no pedido do passe.">
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Entrada
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000"
              maxLength={4}
              value={telefone4}
              onChange={(e) => setTelefone4(e.target.value.replace(/D/g, "").slice(0, 4))}
              className="h-12 pl-10 text-base tracking-[0.3em]"
              required
              pattern="\d{4}"
            />
          </div>
        </Campo>
      )}
      <button type="button" onClick={() => setPorNascimento((v) => !v)} className="-mt-2 self-start text-sm font-medium text-azul-700 hover:underline">
        {porNascimento ? "Usar o telefone" : "Não lembro o telefone: usar a data de nascimento"}
      </button>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Botao type="submit" disabled={enviando} className="h-12 text-base">
        {enviando ? <Loader2 className="animate-spin" /> : <LogIn />}
        {enviando ? "Entrando…" : "Entrar"}
      </Botao>

      <div className="flex flex-col gap-1 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
        <span>
          Já criou sua senha?{" "}
          <Link href="/aluno" className="font-semibold text-azul-700 hover:underline">
            Entrar na página do aluno
          </Link>
        </span>
        <span>
          Ainda não completou o cadastro?{" "}
          <Link href="/continuar" className="font-semibold text-azul-700 hover:underline">
            Continuar cadastro
          </Link>
        </span>
      </div>
    </form>
  );
}
