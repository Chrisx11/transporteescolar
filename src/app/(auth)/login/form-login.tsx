"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, IdCard, Loader2, LockKeyhole, LogIn, Mail } from "lucide-react";
import { Aviso, Botao, Campo, Entrada, cx } from "@/components/ui";
import { VISUAL_PERFIL } from "@/components/perfis-visual";
import { mascaraCpf } from "@/lib/mascaras";
import { AREAS_LOGIN, type Perfil } from "@/lib/rotulos";

export function FormLogin({ area }: { area: Perfil }) {
  const busca = useSearchParams();
  const pedido = busca.get("voltar");
  const voltar = pedido?.startsWith("/") && !pedido.startsWith("//") ? pedido : undefined;
  // A Administração entra com e-mail; os outros acessos, com CPF.
  const porEmail = area === "admin";
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();
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
        body: JSON.stringify(porEmail ? { email, senha, perfil: area } : { cpf, senha, perfil: area }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        setErro(corpo.erro ?? "Não foi possível entrar.");
        setEnviando(false);
        return;
      }
      const destino = corpo.destino === "/trocar-senha" || !voltar ? corpo.destino : voltar;
      // Navega sem recarregar o site inteiro (os arquivos já baixados são reaproveitados).
      router.replace(destino);
      router.refresh();
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-5">
      {busca.get("erro") === "link" && <Aviso>O link expirou ou já foi usado. Peça um novo.</Aviso>}
      {busca.get("senha") === "redefinida" && <Aviso tipo="ok">Senha alterada. Entre com a nova senha.</Aviso>}
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

      {porEmail ? (
        <Campo rotulo="E-mail">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Entrada
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 pl-10 text-base"
              required
            />
          </div>
        </Campo>
      ) : (
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
      )}
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
      {area === "aluno" && (
        <p className="border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
          Ainda não tem acesso?{" "}
          <Link href="/cadastro" className="font-semibold text-azul-700 hover:underline">
            Faça seu cadastro
          </Link>
        </p>
      )}
    </form>
  );
}
