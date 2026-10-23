import { exigirPerfil } from "@/lib/auth";

/**
 * Destino do QR code fixo do ônibus. A validação do embarque (reserva, horário
 * e distância) chega na Fase 3. A rota já existe para os adesivos impressos
 * agora continuarem válidos.
 */
export default async function PaginaEmbarque() {
  await exigirPerfil("aluno");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl">🚌</p>
      <h1 className="text-xl font-bold">QR code lido</h1>
      <p className="max-w-xs text-sm text-slate-600">
        A confirmação de embarque pelo QR code estará disponível em breve.
      </p>
    </main>
  );
}
