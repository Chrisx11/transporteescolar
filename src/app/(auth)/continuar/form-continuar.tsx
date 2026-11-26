"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ClipboardList, Loader2, Search } from "lucide-react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { buscarPedido } from "./acoes";
import { mascaraTelefone } from "../cadastro/form-cadastro";

/** Só números e sinais de telefone → é telefone; qualquer letra ou @ → é e-mail. */
const pareceTelefone = (v: string) => v.trim() !== "" && /^[\d\s()+-]+$/.test(v);
const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function FormContinuar() {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<{ texto: string; dica?: "cadastro" | "primeiro-acesso" } | null>(null);
  const tipo = !valor.trim() ? null : pareceTelefone(valor) ? "telefone" : "email";

  function mudar(v: string) {
    setErro(null);
    // Telefone: formata enquanto digita, (22) 99999-9999. E-mail: deixa como está, sem espaços.
    setValor(pareceTelefone(v) ? mascaraTelefone(v) : v.replace(/\s/g, ""));
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (tipo === "email" && !emailValido(valor)) {
      setErro({ texto: valor.includes("@") ? "Confira o e-mail: está incompleto (ex.: nome@gmail.com)." : "Falta o @ no e-mail (ex.: nome@gmail.com)." });
      return;
    }
    if (tipo === "telefone" && valor.replace(/\D/g, "").length < 10) {
      setErro({ texto: "Digite o telefone com DDD, por exemplo (22) 99999-9999." });
      return;
    }
    setBuscando(true);
    const r = await buscarPedido(valor);
    if (r.ok) {
      router.push(`/completar/${r.codigo}`);
      return;
    }
    setErro({ texto: r.erro, dica: r.dica });
    setBuscando(false);
  }

  return (
    <form onSubmit={buscar} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-azul-500 to-azul-700 text-white shadow-lg">
          <ClipboardList className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Continuar meu cadastro</h1>
          <p className="text-sm text-slate-500">Para quem fez a inscrição ou a renovação do passe no formulário antigo.</p>
        </div>
      </div>

      <Campo rotulo="E-mail ou telefone (WhatsApp)" ajuda="Use o mesmo e-mail ou telefone que você informou na inscrição.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Entrada
            value={valor}
            onChange={(e) => mudar(e.target.value)}
            placeholder="seu@email.com ou (22) 99999-9999"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            className="h-12 pl-10 text-base"
            required
          />
        </div>
        {tipo && (
          <p className="mt-1.5 text-xs text-slate-500">
            {tipo === "telefone" ? (
              "Buscando pelo telefone."
            ) : emailValido(valor) ? (
              "Buscando pelo e-mail."
            ) : (
              <span className="text-amber-700">{valor.includes("@") ? "E-mail incompleto." : "Para buscar pelo e-mail, digite com @."}</span>
            )}
          </p>
        )}
      </Campo>

      {erro && (
        <Aviso tipo={erro.dica === "primeiro-acesso" ? "ok" : "erro"}>
          {erro.texto}{" "}
          {erro.dica === "cadastro" && (
            <Link href="/cadastro" className="font-semibold underline">
              Fazer cadastro novo
            </Link>
          )}
          {erro.dica === "primeiro-acesso" && (
            <Link href="/primeiro-acesso" className="font-semibold underline">
              Fazer o primeiro acesso
            </Link>
          )}
        </Aviso>
      )}

      <Botao type="submit" disabled={buscando} className="h-12 text-base">
        {buscando ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {buscando ? "Procurando…" : "Continuar"}
      </Botao>

      <div className="flex flex-col gap-1 border-t border-slate-100 pt-4 text-center text-sm text-slate-600">
        <span>
          Nunca se inscreveu?{" "}
          <Link href="/cadastro" className="font-semibold text-azul-700 hover:underline">
            Faça seu cadastro
          </Link>
        </span>
        <span>
          Cadastro já aprovado?{" "}
          <Link href="/primeiro-acesso" className="font-semibold text-azul-700 hover:underline">
            Primeiro acesso
          </Link>
        </span>
      </div>
    </form>
  );
}
