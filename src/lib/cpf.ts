/** Remove tudo que não é dígito. */
export function limparCpf(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Valida CPF pelos dígitos verificadores (mesma regra da função SQL cpf_valido). */
export function cpfValido(valor: string): boolean {
  const cpf = limparCpf(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const d = cpf.split("").map(Number);
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += d[i] * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}

/** 12345678909 → 123.456.789-09 */
export function formatarCpf(valor: string): string {
  const cpf = limparCpf(valor);
  if (cpf.length !== 11) return valor;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
