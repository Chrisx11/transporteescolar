import type { Metadata } from "next";
import { SlidersHorizontal } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { BotaoEnviar, Formulario } from "@/components/formulario";
import { Cartao, Entrada, Titulo } from "@/components/ui";
import { salvarParametro } from "./acoes";

export const metadata: Metadata = { title: "Parâmetros" };

type Parametro = { chave: string; valor: unknown; tipo: "numero" | "texto" | "hora" | "booleano"; rotulo: string; descricao: string | null };

export default async function PaginaParametros() {
  await exigirPerfil("admin");
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("parametros").select("chave, valor, tipo, rotulo, descricao").order("chave");
  const lista = (data ?? []) as Parametro[];

  return (
    <>
      <Titulo icone={SlidersHorizontal} descricao="Regras ajustáveis do sistema. As mudanças valem a partir do próximo cálculo.">Parâmetros</Titulo>
      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((p) => (
          <Cartao key={p.chave}>
            <Formulario acao={salvarParametro} className="gap-2">
              <input type="hidden" name="chave" value={p.chave} />
              <input type="hidden" name="tipo" value={p.tipo} />
              <p className="font-medium">{p.rotulo}</p>
              {p.descricao && <p className="text-xs text-slate-500">{p.descricao}</p>}
              <div className="flex items-center gap-2">
                {p.tipo === "booleano" ? (
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" name="valor" defaultChecked={p.valor === true} className="size-4 accent-azul-600" />
                    Ativado
                  </label>
                ) : (
                  <Entrada
                    name="valor"
                    type={p.tipo === "hora" ? "time" : p.tipo === "numero" ? "number" : "text"}
                    min={p.tipo === "numero" ? 0 : undefined}
                    defaultValue={String(p.valor)}
                    className="flex-1"
                    required
                  />
                )}
                <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
              </div>
            </Formulario>
          </Cartao>
        ))}
      </div>
    </>
  );
}
