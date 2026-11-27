import { notFound } from "next/navigation";
import { CartaoNotificacoes, JanelaNotificacoes } from "@/components/notificacoes";
import { TelaNotificacoes } from "@/app/app/notificacoes/tela-notificacoes";

/** Prévia das notificações (cartão, janela e tela), só no servidor local (404 em produção). */
export default async function PreviaNotificacoes({ searchParams }: { searchParams: Promise<{ app?: string; simular?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const app = sp.app === "motorista" ? "motorista" : "aluno";
  // ?simular=pendente: finge que ainda não perguntou (o navegador da prévia bloqueia notificações).
  const simular = sp.simular === "pendente";
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 bg-[#f4f6fb] p-4">
      {simular && (
        <script dangerouslySetInnerHTML={{ __html: "Object.defineProperty(Notification, 'permission', { get: () => 'default' }); localStorage.clear();" }} />
      )}
      <JanelaNotificacoes app={app} />
      <CartaoNotificacoes app={app} />
      <TelaNotificacoes app={app} lembretes />
    </main>
  );
}
