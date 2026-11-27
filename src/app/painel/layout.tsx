import { cookies } from "next/headers";
import { exigirPerfil } from "@/lib/auth";
import { PERFIS } from "@/lib/rotulos";
import { formatarCpf } from "@/lib/cpf";
import { MenuLateral } from "./menu-lateral";
import { BarraSuperior } from "./barra-superior";
import { COOKIE_MENU } from "./navegacao";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await exigirPerfil("semeduc", "semtransp", "admin");
  // Lido no servidor para o menu já abrir do jeito certo, sem "piscar".
  const recolhido = (await cookies()).get(COOKIE_MENU)?.value === "1";

  return (
    <div className="flex min-h-dvh">
      <MenuLateral perfil={sessao.perfil} recolhidoInicial={recolhido} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior
          usuario={{
            nome: sessao.nome,
            perfilRotulo: PERFIS[sessao.perfil],
            cpf: formatarCpf(sessao.cpf),
            email: sessao.email,
          }}
        />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl animate-surgir px-4 py-6 sm:px-6 md:py-8 lg:px-10">{children}</div>
        </main>
        <footer className="nao-imprimir border-t border-slate-200/70 px-4 py-4 text-xs text-slate-400 sm:px-6 lg:px-10">
          Prefeitura Municipal de Italva · Transporte Universitário
        </footer>
      </div>
    </div>
  );
}
