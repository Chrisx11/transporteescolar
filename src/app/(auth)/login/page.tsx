import { redirect } from "next/navigation";

/** Endereço antigo: cada acesso agora tem o próprio (/aluno, /motorista, /semeduc, /semtransp, /admin). */
export default async function LoginAntigo({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(q ? `/aluno?${q}` : "/aluno");
}
