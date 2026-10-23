/** Esqueleto das telas de celular enquanto carregam. */
export default function CarregandoApp() {
  const bloco = "animate-pulse rounded-2xl bg-white shadow-suave";
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <div className={`${bloco} h-20`} />
      <div className={`${bloco} h-32 rounded-3xl`} />
      <div className={`${bloco} h-32 rounded-3xl`} />
    </div>
  );
}
