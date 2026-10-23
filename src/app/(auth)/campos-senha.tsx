import { Campo, Entrada } from "@/components/ui";

export function CamposNovaSenha() {
  return (
    <>
      <Campo rotulo="Nova senha" ajuda="Pelo menos 8 caracteres, com letras e números.">
        <Entrada className="h-12 text-base" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      </Campo>
      <Campo rotulo="Repita a nova senha">
        <Entrada className="h-12 text-base" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
      </Campo>
    </>
  );
}
