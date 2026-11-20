import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { draftFromParsed, missing } from './drafts'
import { confusableAlt } from './confusables'
import { nameKey } from './names'
import type { ParsedEntry } from './api'
import type { Regular } from './types'

const pe = (p: Partial<ParsedEntry> & { kind: string }): ParsedEntry => ({ amount: null, amount_span: null, qty: null, rate: null,
  unit: null, category: null, member: null, person: null, account: null, regular: null, regular_event: null, mode: null,
  date_offset_days: 0, occasion: null, note: null, clarify: null, amount_check: 'none', rate_check: 'none', dropped_amount: null, ...p })

const milk: Regular = { id: 3, name: 'दूधवाले भैया', nameKey: nameKey('दूधवाले भैया'), template: 'milk', category: 'doodh',
  billing: 'daily_qty', rate: 64, unit: 'L', defaultQty: 1, deductLeaves: false, allowedLeaves: 0, startDate: '2026-01-01', pauses: [], createdAt: 0 }
const house = { members: [{ id: 1, name: 'दादाजी', nameKey: nameKey('दादाजी'), createdAt: 0 }], regulars: [milk], accounts: [], people: [] }

describe('drafts', () => {
  it('app multiplies qty x rate (never the model)', () => {
    const d = draftFromParsed(pe({ kind: 'expense', qty: 3, rate: 400, category: 'labour' }), house, 'hi')
    expect(d.amount).toBe(1200)
  })
  it('matches regular by synonym and member by name across forms', () => {
    const d = draftFromParsed(pe({ kind: 'regular_event', regular: 'doodhwala', regular_event: 'skip' }), house, 'hi')
    expect(d.regularId).toBe(3)
    expect(missing(d)).toBeNull()
    const m = draftFromParsed(pe({ kind: 'expense', amount: 50, member: 'Dadaji' }), house, 'hi')
    expect(m.memberId).toBe(1)
  })
  it('flags missing amount and offers confusable alternative', () => {
    expect(missing(draftFromParsed(pe({ kind: 'expense' }), house, 'hi'))).toBe('amount')
    expect(draftFromParsed(pe({ kind: 'expense', amount: 60 }), house, 'hi').alt).toBe(7)
    expect(confusableAlt(15, 'en')).toBe(50)
    expect(confusableAlt(420, 'hi')).toBeUndefined()
  })
  it('flags low-confidence audio and implausible amounts in any language', () => {
    expect(draftFromParsed(pe({ kind: 'expense', amount: 420, category: 'dawai' }), house, 'ta', { lowConfidence: true }).amountCheck).toBe('unverified')
    expect(draftFromParsed(pe({ kind: 'expense', amount: 80000, category: 'sabzi' }), house, 'bn').amountCheck).toBe('unverified')
    expect(draftFromParsed(pe({ kind: 'expense', amount: 80, category: 'sabzi', amount_check: 'derived' }), house, 'bn').amountCheck).toBe('derived')
    expect(confusableAlt(70, 'ta')).toBe(7)
    expect(confusableAlt(90, 'te')).toBe(9)
    expect(confusableAlt(250, 'bn')).toBe(150)
  })
  it('maps leave/skip by service type so skipped deliveries are never billed', () => {
    expect(draftFromParsed(pe({ kind: 'regular_event', regular: 'doodhwala', regular_event: 'leave' }), house, 'hi').regularEvent).toBe('skip')
  })
  it('khata needs an account name', () => {
    expect(missing(draftFromParsed(pe({ kind: 'credit_purchase', amount: 450 }), house, 'hi'))).toBe('account')
  })
})
