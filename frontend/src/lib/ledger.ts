// Derived balances (pure functions, unit-tested in ledger.test.ts). The app does all arithmetic.
import type { Entry, Kind, Regular, RegularEvent, Settings } from './types'
import { monthBill } from './billing'
import { round2 } from './money'
import { todayStr } from './dates'

const CASH_IN: Kind[] = ['income', 'cash_withdrawal', 'loan_taken', 'loan_repaid_to_us', 'gift_received']
const CASH_OUT: Kind[] = ['expense', 'cash_deposit', 'loan_given', 'loan_repaid_by_us', 'gift_given', 'credit_payment', 'regular_payment']

export function cashDelta(e: Entry): number {
  if (e.kind === 'cash_withdrawal') return e.amount
  if (e.kind === 'cash_deposit') return -e.amount
  if (e.mode !== 'cash') return 0
  if (CASH_IN.includes(e.kind)) return e.amount
  if (CASH_OUT.includes(e.kind)) return -e.amount
  return 0 // credit_purchase: no cash moves
}

export function cashInHand(entries: Entry[], s: Pick<Settings, 'openingCash' | 'openingCashDate'>): number {
  return round2(entries
    .filter((e) => e.date >= s.openingCashDate)
    .reduce((sum, e) => sum + cashDelta(e), s.openingCash))
}

export function khataBalance(entries: Entry[], accountId: number): number {
  return round2(entries.reduce((s, e) => {
    if (e.accountId !== accountId) return s
    if (e.kind === 'credit_purchase') return s + e.amount
    if (e.kind === 'credit_payment') return s - e.amount
    return s
  }, 0))
}

export interface PersonSummary { owesUs: number; giftsGiven: number; giftsReceived: number }

export function personSummary(entries: Entry[], personId: number): PersonSummary {
  let owesUs = 0, giftsGiven = 0, giftsReceived = 0
  for (const e of entries) {
    if (e.personId !== personId) continue
    if (e.kind === 'loan_given') owesUs += e.amount
    if (e.kind === 'loan_repaid_to_us') owesUs -= e.amount
    if (e.kind === 'loan_taken') owesUs -= e.amount
    if (e.kind === 'loan_repaid_by_us') owesUs += e.amount
    if (e.kind === 'gift_given') giftsGiven += e.amount
    if (e.kind === 'gift_received') giftsReceived += e.amount
  }
  return { owesUs: round2(owesUs), giftsGiven: round2(giftsGiven), giftsReceived: round2(giftsReceived) }
}

export const SPEND_KINDS: Kind[] = ['expense', 'credit_purchase']

export interface MonthSummary {
  ym: string
  spend: number
  byCategory: { category: string; amount: number }[]
  income: number
  giftsGiven: number
  regularTotal: number
}

/** Spend = expenses + khata purchases + regular-service accruals (bill payments are not counted twice). */
export function monthSummary(entries: Entry[], regulars: Regular[], events: RegularEvent[], ym: string): MonthSummary {
  const cats = new Map<string, number>()
  let income = 0, giftsGiven = 0
  for (const e of entries) {
    if (!e.date.startsWith(ym)) continue
    if (SPEND_KINDS.includes(e.kind)) cats.set(e.category ?? 'other', (cats.get(e.category ?? 'other') ?? 0) + e.amount)
    if (e.kind === 'income') income += e.amount
    if (e.kind === 'gift_given') giftsGiven += e.amount
  }
  const today = todayStr()
  const upTo = today.startsWith(ym) ? today : undefined
  let regularTotal = 0
  for (const r of regulars) {
    const bill = monthBill(r, events, ym, upTo)
    if (bill.total > 0) {
      regularTotal += bill.total
      cats.set(r.category, (cats.get(r.category) ?? 0) + bill.total)
    }
  }
  const byCategory = [...cats.entries()].map(([category, amount]) => ({ category, amount: round2(amount) }))
    .filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount)
  const spend = round2(byCategory.reduce((s, c) => s + c.amount, 0))
  return { ym, spend, byCategory, income: round2(income), giftsGiven: round2(giftsGiven), regularTotal: round2(regularTotal) }
}

export interface ModeSplit { cash: number; upi: number; card: number }

/** Money actually paid out in a month, by payment mode (khata purchases count when the khata is paid). */
export function monthModes(entries: Entry[], ym: string): ModeSplit {
  const s: ModeSplit = { cash: 0, upi: 0, card: 0 }
  for (const e of entries) {
    if (!e.date.startsWith(ym)) continue
    if (e.kind !== 'expense' && e.kind !== 'regular_payment' && e.kind !== 'credit_payment') continue
    if (e.mode === 'upi') s.upi += e.amount
    else if (e.mode === 'card' || e.mode === 'bank') s.card += e.amount
    else s.cash += e.amount
  }
  return { cash: round2(s.cash), upi: round2(s.upi), card: round2(s.card) }
}

export interface CategoryChange { category: string; values: number[]; delta: number | null }

/** Category x month matrix for the given months (oldest first), with change between the last two. */
export function categoryChanges(summaries: MonthSummary[], limit = 8): CategoryChange[] {
  const cats = new Map<string, number>()
  for (const s of summaries) for (const c of s.byCategory) cats.set(c.category, (cats.get(c.category) ?? 0) + c.amount)
  return [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([category]) => {
    const values = summaries.map((s) => s.byCategory.find((c) => c.category === category)?.amount ?? 0)
    const n = values.length
    return { category, values, delta: n >= 2 ? round2(values[n - 1] - values[n - 2]) : null }
  })
}

export function daySpend(entries: Entry[], date: string): number {
  return round2(entries.filter((e) => e.date === date && SPEND_KINDS.includes(e.kind)).reduce((s, e) => s + e.amount, 0))
}
