/** Esqueleto mostrado enquanto uma página do painel carrega. */
export default function CarregandoPainel() {
  const bloco = "animate-pulse rounded-2xl bg-slate-200/70";
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="mb-8 flex items-center gap-4">
        <div className={`${bloco} size-12`} />
        <div className="flex flex-col gap-2">
          <div className={`${bloco} h-7 w-56 rounded-lg`} />
          <div className={`${bloco} h-4 w-80 max-w-[60vw] rounded-lg`} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div className="h-10 border-b border-slate-100 bg-slate-50" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-0">
              <div className={`${bloco} h-4 w-1/4 rounded-md`} />
              <div className={`${bloco} h-4 w-1/5 rounded-md`} />
              <div className={`${bloco} h-4 w-1/6 rounded-md`} />
              <div className={`${bloco} ml-auto h-6 w-16 rounded-full`} />
            </div>
          ))}
        </div>
        <div className={`${bloco} h-80`} />
      </div>
    </div>
  );
}
