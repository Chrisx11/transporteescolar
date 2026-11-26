import { Suspense } from "react";
import type { Perfil } from "@/lib/rotulos";
import { FormLogin } from "./login/form-login";

/**
 * Página de login de um acesso. Cada acesso tem o próprio endereço
 * (/aluno, /motorista, /semeduc, /semtransp, /admin) e não mostra os outros.
 * A página é pronta (estática): os avisos e o "voltar" são lidos no navegador.
 */
export function PaginaLogin({ area }: { area: Perfil }) {
  return (
    <Suspense>
      <FormLogin area={area} />
    </Suspense>
  );
}
