const pad = (n: number) => String(n).padStart(2, '0')

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayStr(): string {
  return ymd(new Date())
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export function monthOf(s: string): string {
  return s.slice(0, 7)
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthDays(ym: string): string[] {
  const n = daysInMonth(ym)
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`)
}

export function locale(lang: string): string {
  return ({ en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', te: 'te-IN', ta: 'ta-IN' } as Record<string, string>)[lang] ?? 'en-IN'
}

export function formatDay(s: string, lang: string): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(parseYmd(s))
}

export function formatMonth(ym: string, lang: string): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(parseYmd(`${ym}-01`))
}

export function isEvening(d = new Date()): boolean {
  const h = d.getHours()
  return h >= 19 || h < 5
}
