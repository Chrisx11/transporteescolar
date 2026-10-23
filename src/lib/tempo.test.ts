import { describe, expect, it } from "vitest";
import { calcularPrazo, diaSemanaIso, hojeSP, instanteSP, somarDias } from "./tempo";

describe("fuso America/Sao_Paulo", () => {
  it("converte horário local de São Paulo para UTC (UTC−3)", () => {
    expect(instanteSP("2026-10-23", "19:00").toISOString()).toBe("2026-10-23T22:00:00.000Z");
    expect(instanteSP("2026-10-23", "00:00").toISOString()).toBe("2026-10-23T03:00:00.000Z");
  });

  it("hoje em SP muda à meia-noite de SP, não à de UTC", () => {
    // 23/10 às 23:30 em SP = 24/10 02:30 UTC
    expect(hojeSP(new Date("2026-10-24T02:30:00Z"))).toBe("2026-10-23");
    expect(hojeSP(new Date("2026-10-24T03:00:00Z"))).toBe("2026-10-24");
  });
});

describe("prazos de reserva (cenários 2 e 3)", () => {
  it("ida manhã de Campos: prazo 19:00 do dia anterior", () => {
    const prazo = calcularPrazo("2026-10-27", "dia_anterior", "19:00");
    expect(prazo.toISOString()).toBe("2026-10-26T22:00:00.000Z");
    const as1859 = instanteSP("2026-10-26", "18:59");
    const as1901 = instanteSP("2026-10-26", "19:01");
    expect(as1859 < prazo).toBe(true); // aceita
    expect(as1901 < prazo).toBe(false); // botão inativo
  });

  it("volta tarde: cancelamento até 15:00 do mesmo dia", () => {
    const prazo = calcularPrazo("2026-10-27", "mesmo_dia", "15:00");
    expect(instanteSP("2026-10-27", "14:59") < prazo).toBe(true);
    expect(instanteSP("2026-10-27", "15:01") < prazo).toBe(false);
  });

  it("dia anterior atravessa virada de mês", () => {
    expect(calcularPrazo("2026-11-01", "dia_anterior", "19:00").toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });
});

describe("datas", () => {
  it("dia da semana ISO", () => {
    expect(diaSemanaIso("2026-10-26")).toBe(1); // segunda
    expect(diaSemanaIso("2026-10-31")).toBe(6); // sábado
    expect(diaSemanaIso("2026-11-01")).toBe(7); // domingo
  });
  it("soma dias", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
