const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export function inr(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}₹${fmt.format(Math.abs(Math.round(n * 100) / 100))}`
}

export function num(n: number): string {
  return fmt.format(Math.round(n * 100) / 100)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
