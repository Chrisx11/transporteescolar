import { describe, expect, it } from "vitest";
import { cpfAceito, cpfValido, formatarCpf, limparCpf } from "./cpf";

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

describe("cpfAceito", () => {
  it("exige CPF verdadeiro por padrão", () => {
    delete process.env.ACEITAR_CPF_DE_TESTE;
    expect(cpfAceito("123.456.789-00")).toBe(false);
    expect(cpfAceito("529.982.247-25")).toBe(true);
  });

  it("aceita qualquer número de 11 dígitos no modo de teste", () => {
    process.env.ACEITAR_CPF_DE_TESTE = "sim";
    expect(cpfAceito("123.456.789-00")).toBe(true);
    expect(cpfAceito("11111111111")).toBe(true);
    expect(cpfAceito("1234567890")).toBe(false);
    delete process.env.ACEITAR_CPF_DE_TESTE;
  });
});
