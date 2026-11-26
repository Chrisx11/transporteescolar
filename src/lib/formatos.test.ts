import { describe, expect, it } from "vitest";
import { nomePadrao, telefonePadrao } from "./formatos";

describe("padronização", () => {
  it("nome em maiúsculas sem espaços sobrando", () => {
    expect(nomePadrao("  maria  da   conceição ")).toBe("MARIA DA CONCEIÇÃO");
  });
  it("telefone no padrão (00) 00000-0000", () => {
    expect(telefonePadrao("22999690000")).toBe("(22) 99969-0000");
    expect(telefonePadrao("(22) 99969-0000")).toBe("(22) 99969-0000");
    expect(telefonePadrao("+55 22 99969-0000")).toBe("(22) 99969-0000");
    expect(telefonePadrao("022 99969 0000")).toBe("(22) 99969-0000");
    expect(telefonePadrao("99969-0000")).toBe("(22) 99969-0000");
    expect(telefonePadrao("2299690000")).toBe("(22) 99969-0000"); // celular antigo sem o 9
    expect(telefonePadrao("2238241234")).toBe("(22) 3824-1234"); // fixo
    expect(telefonePadrao("22999690000 / 22988887777")).toBe("(22) 99969-0000");
    expect(telefonePadrao("")).toBe("");
  });
});
