import { describe, expect, it } from 'vitest'
import { cashInHand, categoryChanges, khataBalance, monthModes, monthSummary, personSummary } from './ledger'
import type { Entry, Regular } from './types'

let c = 0
const e = (p: Partial<Entry> & Pick<Entry, 'kind' | 'amount'>): Entry =>
  ({ date: '2026-11-10', mode: 'cash', source: 'typed', createdAt: ++c, ...p })

describe('cash in hand', () => {
  it('moves only with cash transactions', () => {
    const entries = [
      e({ kind: 'expense', amount: 60 }),
      e({ kind: 'expense', amount: 300, mode: 'upi' }),         // UPI: no cash change
      e({ kind: 'cash_withdrawal', amount: 5000 }),               // bank -> cash
      e({ kind: 'credit_purchase', amount: 450 }),               // khata: no cash yet
      e({ kind: 'credit_payment', amount: 2000 }),
      e({ kind: 'loan_given', amount: 1000 }),
      e({ kind: 'loan_repaid_to_us', amount: 400 }),
      e({ kind: 'income', amount: 38000, mode: 'bank' }),        // pension to bank: no cash
      e({ kind: 'regular_payment', amount: 1888 }),
      e({ kind: 'expense', amount: 999, date: '2026-10-01' }),   // before opening date: ignored
    ]
    expect(cashInHand(entries, { openingCash: 3000, openingCashDate: '2026-11-01' }))
      .toBe(3000 - 60 + 5000 - 2000 - 1000 + 400 - 1888)
  })
})

describe('balances', () => {
  it('khata balance = purchases - payments', () => {
    const entries = [e({ kind: 'credit_purchase', amount: 450, accountId: 1 }), e({ kind: 'credit_purchase', amount: 320, accountId: 1 }),
      e({ kind: 'credit_payment', amount: 500, accountId: 1 }), e({ kind: 'credit_purchase', amount: 99, accountId: 2 })]
    expect(khataBalance(entries, 1)).toBe(270)
  })
  it('person loans and gifts are tracked separately', () => {
    const entries = [e({ kind: 'loan_given', amount: 5000, personId: 7 }), e({ kind: 'loan_repaid_to_us', amount: 2000, personId: 7 }),
      e({ kind: 'gift_given', amount: 1100, personId: 7 })]
    expect(personSummary(entries, 7)).toEqual({ owesUs: 3000, giftsGiven: 1100, giftsReceived: 0 })
  })
})

describe('month comparison', () => {
  it('splits money paid out by mode (khata counts when paid)', () => {
    const entries = [e({ kind: 'expense', amount: 60, date: '2026-10-02' }), e({ kind: 'expense', amount: 300, mode: 'upi', date: '2026-10-03' }),
      e({ kind: 'credit_purchase', amount: 450, date: '2026-10-04' }), e({ kind: 'credit_payment', amount: 450, mode: 'upi', date: '2026-10-09' }),
      e({ kind: 'regular_payment', amount: 1900, mode: 'bank', date: '2026-10-03' }), e({ kind: 'income', amount: 38000, mode: 'bank', date: '2026-10-01' })]
    expect(monthModes(entries, '2026-10')).toEqual({ cash: 60, upi: 750, card: 1900 })
  })
  it('category changes compare the last two months', () => {
    const s = (ym: string, cats: [string, number][]) => ({ ym, spend: 0, income: 0, giftsGiven: 0, regularTotal: 0,
      byCategory: cats.map(([category, amount]) => ({ category, amount })) })
    const ch = categoryChanges([s('2026-09', [['sabzi', 1500], ['dawai', 800]]), s('2026-10', [['sabzi', 1700], ['gas', 1105]])])
    expect(ch.find((c) => c.category === 'sabzi')).toEqual({ category: 'sabzi', values: [1500, 1700], delta: 200 })
    expect(ch.find((c) => c.category === 'dawai')?.delta).toBe(-800)
    expect(ch.find((c) => c.category === 'gas')?.values).toEqual([0, 1105])
  })
})

describe('month summary', () => {
  it('counts regular accruals once and not their payments', () => {
    const milk: Regular = { id: 1, name: 'Milk', nameKey: 'milk', template: 'milk', category: 'doodh', billing: 'daily_qty', rate: 50,
      unit: 'L', defaultQty: 1, deductLeaves: false, allowedLeaves: 0, startDate: '2026-10-01', pauses: [], createdAt: 0 }
    const entries = [e({ kind: 'expense', amount: 60, category: 'sabzi', date: '2026-10-02' }),
      e({ kind: 'regular_payment', amount: 1550, regularId: 1, month: '2026-10', date: '2026-10-31' }),
      e({ kind: 'credit_purchase', amount: 450, category: 'kirana', date: '2026-10-05' }),
      e({ kind: 'gift_given', amount: 1100, date: '2026-10-07' })]
    const s = monthSummary(entries, [milk], [], '2026-10')
    expect(s.spend).toBe(60 + 31 * 50 + 450)
    expect(s.giftsGiven).toBe(1100)
    expect(s.byCategory[0].category).toBe('doodh')
  })
})
