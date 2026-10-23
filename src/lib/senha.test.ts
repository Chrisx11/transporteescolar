import { describe, expect, it } from "vitest";
import { gerarSenhaProvisoria, validarNovaSenha } from "./senha";

describe("senhas", () => {
  it("senha provisória tem formato fácil de ditar e passa na validação", () => {
    for (let i = 0; i < 50; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toMatch(/^[a-z]{3}-\d{4}-[a-z]{3}$/);
      expect(validarNovaSenha(s)).toBeNull();
    }
  });

  it("exige 8 caracteres com letras e números", () => {
    expect(validarNovaSenha("abc123")).not.toBeNull();
    expect(validarNovaSenha("abcdefgh")).not.toBeNull();
    expect(validarNovaSenha("12345678")).not.toBeNull();
    expect(validarNovaSenha("onibus2026")).toBeNull();
  });
});
