// Display helpers so nothing user-facing is hardcoded in one language.
import type { Regular } from './types'
import { locale } from './dates'

type T = (key: string, opts?: Record<string, unknown>) => string

/** Services created from a template without a custom name follow the current UI language. */
export function regularName(r: Pick<Regular, 'name' | 'template' | 'autoName'>, t: T): string {
  return r.autoName ? t(`tpl.${r.template}`) : r.name
}

/** Narrow weekday letters, Sunday first, in the given language. */
export function weekdayLetters(lang: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale(lang), { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 10, 1 + i)))  // 1 Nov 2026 is a Sunday
}

export function modeLabel(mode: string, t: T): string {
  return mode === 'upi' ? t('month.modeUpi') : mode === 'cash' ? t('month.modeCash') : t('month.modeCard')
}

/** Compact amount in the user's language, e.g. ₹18K / ₹18 हज़ार. */
export function compactInr(n: number, lang: string): string {
  return `₹${new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`
}

export function dayOffsetLabel(offset: number, t: T): string {
  return offset === 0 ? t('common.today') : offset === -1 ? t('common.yesterday') : t('common.daysAgo', { n: -offset })
}

export function shortMonth(ym: string, lang: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(lang), { month: 'short' }).format(new Date(y, m - 1, 1))
}
