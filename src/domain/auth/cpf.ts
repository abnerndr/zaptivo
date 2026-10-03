/** Normalize CPF to digits only. */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '')
}

/** Validate Brazilian CPF check digits. */
export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false

  const calc = (base: string, factor: number) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (factor - i)
    }
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }

  const d1 = calc(cpf.slice(0, 9), 10)
  const d2 = calc(cpf.slice(0, 10), 11)
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10])
}
