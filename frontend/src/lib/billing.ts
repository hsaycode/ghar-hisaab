// Regular-services billing engine (pure functions, unit-tested in billing.test.ts).
import type { Entry, Regular, RegularEvent } from './types'
import { daysInMonth, monthDays } from './dates'
import { round2 } from './money'

export type DayStatus = 'before' | 'future' | 'paused' | 'came' | 'skipped' | 'extra' | 'less' | 'units' | 'none'
  | 'present' | 'leave' | 'half'

export interface DayInfo { date: string; status: DayStatus; qty: number; amount: number }

export interface Bill {
  ym: string
  days: DayInfo[]
  total: number
  units: number        // litres / papers / pieces / cans
  leaves: number       // monthly
  deduction: number    // monthly, only if deductLeaves
  advances: number     // monthly
  base: number         // monthly salary (prorated)
  rateNow: number
}

export function rateOn(reg: Regular, events: RegularEvent[], date: string): number {
  let rate = reg.rate
  const changes = events
    .filter((e) => e.type === 'rate_change' && e.date <= date && e.amount != null)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
  for (const c of changes) rate = c.amount as number
  return rate
}

function isPaused(reg: Regular, date: string): boolean {
  return reg.pauses.some((p) => p.from <= date && date <= p.to)
}

/** Bill for month `ym`, counting days up to and including `upTo` (default: whole month). */
export function monthBill(reg: Regular, allEvents: RegularEvent[], ym: string, upTo?: string): Bill {
  const events = allEvents.filter((e) => e.regularId === reg.id)
  const byDay = new Map<string, RegularEvent[]>()
  for (const e of events) {
    if (!e.date.startsWith(ym)) continue
    const list = byDay.get(e.date) ?? []
    list.push(e)
    byDay.set(e.date, list)
  }
  for (const list of byDay.values()) list.sort((a, b) => a.createdAt - b.createdAt)

  const days: DayInfo[] = []
  let total = 0, units = 0, leaves = 0, advances = 0, activeDays = 0
  const nDays = daysInMonth(ym)

  // Advances are recorded as regular_payment entries (money already paid towards the month),
  // so they reduce "due" via paidFor() and are never subtracted from the bill a second time.
  for (const date of monthDays(ym)) {
    const dayEvents = byDay.get(date) ?? []
    if (date < reg.startDate) { days.push({ date, status: 'before', qty: 0, amount: 0 }); continue }
    if (upTo && date > upTo) { days.push({ date, status: 'future', qty: 0, amount: 0 }); continue }
    if (isPaused(reg, date)) { days.push({ date, status: 'paused', qty: 0, amount: 0 }); continue }
    activeDays++
    const rate = rateOn(reg, events, date)

    if (reg.billing === 'daily_qty') {
      let qty = reg.defaultQty
      let status: DayStatus = 'came'
      for (const e of dayEvents) {
        if (e.type === 'skip') { qty = 0; status = 'skipped' }
        else if (e.type === 'came') { qty = reg.defaultQty; status = 'came' }
        else if (e.type === 'extra') { qty += e.qty ?? 0; status = 'extra' }
        else if (e.type === 'less') { qty = Math.max(0, qty - (e.qty ?? 0)); status = qty === 0 ? 'skipped' : 'less' }
      }
      const amount = round2(qty * rate)
      units += qty
      total += amount
      days.push({ date, status, qty, amount })
    } else if (reg.billing === 'per_unit') {
      const qty = dayEvents.filter((e) => e.type === 'units').reduce((s, e) => s + (e.qty ?? 0), 0)
      const amount = round2(qty * rate)
      units += qty
      total += amount
      days.push({ date, status: qty > 0 ? 'units' : 'none', qty, amount })
    } else {
      let status: DayStatus = 'present'
      for (const e of dayEvents) {
        if (e.type === 'leave') status = 'leave'
        else if (e.type === 'half_leave') status = 'half'
        else if (e.type === 'came') status = 'present'
      }
      if (status === 'leave') leaves += 1
      if (status === 'half') leaves += 0.5
      days.push({ date, status, qty: 0, amount: 0 })
    }
  }

  let base = 0, deduction = 0
  if (reg.billing === 'monthly') {
    const salary = rateOn(reg, events, `${ym}-${String(nDays).padStart(2, '0')}`)
    const startsInMonth = reg.startDate.startsWith(ym)
    const eligibleDays = startsInMonth ? days.filter((d) => d.status !== 'before').length : nDays
    base = round2(salary * (eligibleDays / nDays))
    if (reg.deductLeaves) {
      const excess = Math.max(0, leaves - reg.allowedLeaves)
      deduction = round2(excess * (salary / nDays))
    }
    total = Math.max(0, round2(base - deduction))
  }
  void activeDays

  return {
    ym, days, total: round2(total), units: round2(units), leaves, deduction, advances: round2(advances), base,
    rateNow: rateOn(reg, events, upTo ?? `${ym}-${String(nDays).padStart(2, '0')}`),
  }
}

export function paidFor(entries: Entry[], regularId: number, ym: string): number {
  return round2(entries
    .filter((e) => e.kind === 'regular_payment' && e.regularId === regularId && e.month === ym)
    .reduce((s, e) => s + e.amount, 0))
}
