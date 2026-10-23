"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, IdCard, Loader2, LockKeyhole, LogIn } from "lucide-react";
import { Aviso, Botao, Campo, Entrada, cx } from "@/components/ui";
import { VISUAL_PERFIL } from "@/components/perfis-visual";
import { mascaraCpf } from "@/lib/mascaras";
import { AREAS_LOGIN, type Perfil } from "@/lib/rotulos";

export function FormLogin({ area, voltar }: { area: Perfil; voltar?: string }) {
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const info = AREAS_LOGIN[area];
  const { icone: Icone, gradiente } = VISUAL_PERFIL[area];

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, senha, perfil: area }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível entrar.");
        setEnviando(false);
        return;
      }
      const destino = corpo.destino === "/trocar-senha" || !voltar ? corpo.destino : voltar;
      window.location.assign(destino);
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-5">
      <Link
        href="/login"
        className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Outro acesso
      </Link>

      <div className="flex items-center gap-4">
        <span className={cx("flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", gradiente)}>
          <Icone className="size-7" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Entrar como</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{info.titulo}</h1>
          <p className="text-xs text-slate-500">{info.descricao}</p>
        </div>
      </div>

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
      <Campo rotulo="Senha">
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Entrada
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="h-12 px-10 text-base"
            required
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
          >
            {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Campo>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Botao type="submit" disabled={enviando} className="h-12 text-base">
        {enviando ? <Loader2 className="animate-spin" /> : <LogIn />}
        {enviando ? "Entrando…" : "Entrar"}
      </Botao>
      <Link href="/esqueci-senha" className="text-center text-sm font-medium text-azul-700 hover:underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}
