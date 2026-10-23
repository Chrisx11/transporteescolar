import { describe, expect, it } from "vitest";
import { cpfValido, formatarCpf, limparCpf } from "./cpf";

describe("CPF", () => {
  it("aceita CPFs válidos com ou sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("111.444.777-35")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.444.777-53")).toBe(false);
  });

  it("recusa sequências repetidas e tamanhos errados", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("000.000.000-00")).toBe(false);
    expect(cpfValido("1234567890")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });

  it("limpa e formata", () => {
    expect(limparCpf(" 529.982.247-25 ")).toBe("52998224725");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
});
