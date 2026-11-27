import { notFound } from "next/navigation";
import { ConviteInstalar, MenuApp } from "@/components/menu-app";

/** Prévia do cabeçalho do app com o menu e o convite de instalação, só no servidor local (404 em produção). */
export default async function PreviaMenu({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const app = (await searchParams).app === "motorista" ? "motorista" : "aluno";
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-[#f4f6fb]">
      <header className="flex items-center justify-between bg-gradient-to-br from-azul-600 to-azul-900 px-5 pb-16 pt-6 text-white">
        <span className="text-sm font-semibold">Transporte Italva</span>
        <MenuApp app={app} nome="ALUNO TESTE" perfil={app === "motorista" ? "Motorista" : "Aluno"} naoLidos={2} />
      </header>
      <main className="-mt-10 flex flex-col gap-4 px-4">
        <ConviteInstalar app={app} />
        <div className="h-40 rounded-3xl bg-white shadow-suave" />
      </main>
    </div>
  );
}
