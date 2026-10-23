export default function PaginaOffline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl">📶</p>
      <h1 className="text-xl font-bold">Sem conexão</h1>
      <p className="text-sm text-slate-600">Verifique a internet do celular e tente de novo.</p>
    </main>
  );
}
