import { describe, expect, it } from 'vitest'
import { monthBill, paidFor } from './billing'
import type { Entry, Regular, RegularEvent } from './types'

const base: Regular = {
  id: 1, name: 'Milk', nameKey: 'milk', template: 'milk', category: 'doodh', billing: 'daily_qty', rate: 64, unit: 'L',
  defaultQty: 1, deductLeaves: false, allowedLeaves: 2, startDate: '2026-01-01', pauses: [], createdAt: 0,
}
let t = 0
const ev = (date: string, type: RegularEvent['type'], extra: Partial<RegularEvent> = {}): RegularEvent =>
  ({ regularId: 1, date, type, createdAt: ++t, ...extra })

describe('daily_qty', () => {
  it('bills every day at default quantity', () => {
    expect(monthBill(base, [], '2026-11').total).toBe(30 * 64)
    expect(monthBill(base, [], '2026-02').total).toBe(28 * 64)   // February
    expect(monthBill(base, [], '2026-01').total).toBe(31 * 64)
  })
  it('applies skips and extra half-litres (exceptions only)', () => {
    const events = [ev('2026-11-06', 'skip'), ev('2026-11-14', 'skip'), ev('2026-11-03', 'extra', { qty: 0.5 }),
      ev('2026-11-10', 'extra', { qty: 0.5 }), ev('2026-11-21', 'extra', { qty: 0.5 })]
    const b = monthBill(base, events, '2026-11')
    expect(b.units).toBe(29.5)
    expect(b.total).toBe(1888)
  })
  it('rate change mid-month applies from that date', () => {
    const b = monthBill({ ...base, rate: 62 }, [ev('2026-11-15', 'rate_change', { amount: 64 })], '2026-11')
    expect(b.total).toBe(14 * 62 + 16 * 64)
    expect(b.rateNow).toBe(64)
  })
  it('respects start date, upTo and pauses', () => {
    const b = monthBill({ ...base, startDate: '2026-11-11', pauses: [{ from: '2026-11-15', to: '2026-11-17' }] }, [], '2026-11', '2026-11-20')
    expect(b.units).toBe(10 - 3)
  })
  it('last event wins on the same day', () => {
    const b = monthBill(base, [ev('2026-11-05', 'skip'), ev('2026-11-05', 'came')], '2026-11')
    expect(b.units).toBe(30)
  })
})

describe('per_unit', () => {
  it('sums units x rate', () => {
    const press: Regular = { ...base, billing: 'per_unit', rate: 10, unit: 'piece', defaultQty: 0 }
    const b = monthBill(press, [ev('2026-11-02', 'units', { qty: 12 }), ev('2026-11-09', 'units', { qty: 34 })], '2026-11')
    expect(b.units).toBe(46)
    expect(b.total).toBe(460)
  })
})

describe('monthly', () => {
  const maid: Regular = { ...base, billing: 'monthly', rate: 3000, unit: 'month' }
  it('no deduction by default (opt-in)', () => {
    const b = monthBill(maid, [ev('2026-11-03', 'leave'), ev('2026-11-04', 'leave'), ev('2026-11-05', 'leave')], '2026-11')
    expect(b.leaves).toBe(3)
    expect(b.total).toBe(3000)
  })
  it('deducts only leaves beyond the allowance when enabled', () => {
    const b = monthBill({ ...maid, deductLeaves: true }, [ev('2026-11-03', 'leave'), ev('2026-11-04', 'leave'),
      ev('2026-11-05', 'leave'), ev('2026-11-06', 'leave'), ev('2026-11-07', 'half_leave')], '2026-11')
    expect(b.leaves).toBe(4.5)
    expect(b.deduction).toBe(250)   // 2.5 excess days x 3000/30
    expect(b.total).toBe(2750)
  })
  it('prorates a mid-month start', () => {
    const b = monthBill({ ...maid, startDate: '2026-11-16' }, [], '2026-11')
    expect(b.total).toBe(1500)
  })
})

describe('payments', () => {
  it('advance/bill payments reduce due without double counting', () => {
    const entries: Entry[] = [
      { date: '2026-11-05', kind: 'regular_payment', amount: 500, mode: 'cash', regularId: 1, month: '2026-11', note: 'advance', source: 'voice', createdAt: 1 },
      { date: '2026-12-01', kind: 'regular_payment', amount: 1000, mode: 'cash', regularId: 1, month: '2026-11', source: 'typed', createdAt: 2 },
      { date: '2026-11-05', kind: 'regular_payment', amount: 999, mode: 'cash', regularId: 2, month: '2026-11', source: 'typed', createdAt: 3 },
    ]
    expect(paidFor(entries, 1, '2026-11')).toBe(1500)
  })
})
