import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { inicioDoPerfil } from "@/lib/rotulos";

export default async function Inicio() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.troca_senha_obrigatoria) redirect("/trocar-senha");
  redirect(inicioDoPerfil(sessao.perfil));
}
