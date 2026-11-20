// Parse result -> editable drafts -> saved entries/events.
import type { ParsedEntry, ParseResult } from './api'
import type { Account, Entry, Kind, Lang, Member, Mode, Person, Regular, RegularEventType } from './types'
import { db } from './db'
import { addDays, monthOf } from './dates'
import { findByName, nameKey } from './names'
import { confusableAlt, implausible } from './confusables'
import { REGULAR_TEMPLATES } from './categories'

export type DraftKind = Kind | 'regular_event'

export interface Draft {
  key: string
  kind: DraftKind
  amount: number | null
  qty: number | null
  rate: number | null
  unit: string | null
  category: string | null
  memberId: number | null
  personName: string | null
  accountName: string | null
  regularId: number | null
  regularEvent: RegularEventType | null
  mode: Mode
  dateOffset: number
  occasion: string | null
  note: string | null
  amountCheck: string
  alt?: number
}

export interface HouseData {
  members: Member[]
  regulars: Regular[]
  accounts: Account[]
  people: Person[]
}

let seq = 0
const newKey = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`

const KINDS: DraftKind[] = ['expense', 'income', 'cash_withdrawal', 'cash_deposit', 'loan_given', 'loan_taken',
  'loan_repaid_to_us', 'loan_repaid_by_us', 'gift_given', 'gift_received', 'credit_purchase', 'credit_payment',
  'regular_payment', 'regular_event']

export function matchRegular(regulars: Regular[], hint: string | null, category: string | null): Regular | undefined {
  const live = regulars.filter((r) => !r.archived)
  if (hint) {
    const byName = findByName(live, hint)
    if (byName) return byName
    const h = hint.toLowerCase()
    for (const tpl of REGULAR_TEMPLATES) {
      if (tpl.synonyms.some((s) => h.includes(s.toLowerCase()))) {
        const r = live.find((x) => x.template === tpl.id)
        if (r) return r
      }
    }
  }
  if (category) {
    const same = live.filter((r) => r.category === category)
    if (same.length === 1) return same[0]
  }
  return live.length === 1 ? live[0] : undefined
}

export interface DraftOpts { lowConfidence?: boolean }

export function draftFromParsed(e: ParsedEntry, house: HouseData, lang: Lang, opts: DraftOpts = {}): Draft {
  const kind = (KINDS.includes(e.kind as DraftKind) ? e.kind : 'expense') as DraftKind
  const regEvent = (e.regular_event ?? null) as RegularEventType | null
  let amount = e.amount
  let rate = e.rate
  if (kind !== 'regular_event' && amount == null && e.qty != null && e.rate != null) {
    amount = Math.round(e.qty * e.rate * 100) / 100   // the app multiplies, never the model
  }
  if (kind === 'regular_event' && regEvent === 'rate_change' && rate == null) rate = e.amount
  let category = e.category
  if (!category && kind === 'expense') category = 'other'
  if (!category && kind === 'credit_purchase') category = 'kirana'
  if (!category && kind === 'income') category = 'other_income'
  const member = findByName(house.members, e.member)
  const reg = (kind === 'regular_event' || kind === 'regular_payment') ? matchRegular(house.regulars, e.regular, e.category) : undefined
  // Deterministic fix-up by service type (observed live: "milkman didn't come" returned as "leave").
  // Deliveries are skipped; workers take leave. Without this, a skipped milk day would still be billed.
  let regEventFixed = regEvent
  if (reg && regEvent === 'leave' && reg.billing !== 'monthly') regEventFixed = 'skip'
  if (reg && regEvent === 'skip' && reg.billing === 'monthly') regEventFixed = 'leave'
  const mode: Mode = (e.mode === 'upi' || e.mode === 'card' || e.mode === 'bank') ? e.mode : 'cash'
  return {
    key: newKey(), kind, amount, qty: e.qty, rate, unit: e.unit, category,
    memberId: member?.id ?? null, personName: e.person, accountName: e.account,
    regularId: reg?.id ?? null, regularEvent: regEventFixed, mode,
    dateOffset: Math.max(-30, Math.min(0, e.date_offset_days || 0)),
    occasion: e.occasion, note: e.note,
    amountCheck: amount != null && (opts.lowConfidence || implausible(amount, kind, category)) ? 'unverified' : e.amount_check,
    alt: kind === 'regular_event' ? undefined : confusableAlt(amount, lang),
  }
}

export function draftsFromResult(result: ParseResult, house: HouseData, lang: Lang, opts: DraftOpts = {}): Draft[] {
  return result.entries.map((e) => draftFromParsed(e, house, lang, opts))
}

export function blankDraft(kind: DraftKind = 'expense'): Draft {
  return { key: newKey(), kind, amount: null, qty: null, rate: null, unit: null, category: kind === 'expense' ? 'other' : null,
    memberId: null, personName: null, accountName: null, regularId: null, regularEvent: null, mode: 'cash',
    dateOffset: 0, occasion: null, note: null, amountCheck: 'none' }
}

/** What is still missing before this draft can be saved (null = ready). */
export function missing(d: Draft): 'amount' | 'regular' | 'qty' | 'person' | 'account' | null {
  if (d.kind === 'regular_event') {
    if (d.regularId == null) return 'regular'
    if (d.regularEvent === 'advance' && !d.amount) return 'amount'
    if (d.regularEvent === 'rate_change' && !d.rate) return 'amount'
    if ((d.regularEvent === 'extra' || d.regularEvent === 'less' || d.regularEvent === 'units') && !d.qty) return 'qty'
    return null
  }
  if (d.kind === 'regular_payment' && d.regularId == null) return 'regular'
  if (!d.amount || d.amount <= 0) return 'amount'
  if ((d.kind === 'credit_purchase' || d.kind === 'credit_payment') && !d.accountName) return 'account'
  if (['loan_given', 'loan_taken', 'loan_repaid_to_us', 'loan_repaid_by_us'].includes(d.kind) && !d.personName) return 'person'
  return null
}

async function findOrCreate(table: 'accounts' | 'people', name: string): Promise<number> {
  const items = await db[table].toArray()
  const hit = findByName(items, name)
  if (hit?.id) return hit.id
  return db[table].add({ name: name.trim(), nameKey: nameKey(name), createdAt: Date.now() })
}

export interface SavedRef { entryIds: number[]; eventIds: number[] }

export async function commitDrafts(drafts: Draft[], baseDate: string, source: Entry['source'] = 'voice'): Promise<SavedRef> {
  const ref: SavedRef = { entryIds: [], eventIds: [] }
  const now = Date.now()
  for (const d of drafts) {
    if (missing(d)) continue
    const date = addDays(baseDate, d.dateOffset)
    if (d.kind === 'regular_event') {
      if (d.regularEvent === 'advance') {
        ref.entryIds.push(await db.entries.add({ date, kind: 'regular_payment', amount: d.amount as number, mode: d.mode,
          regularId: d.regularId as number, month: monthOf(date), note: 'advance', source, createdAt: now }))
        continue
      }
      ref.eventIds.push(await db.regularEvents.add({ regularId: d.regularId as number, date, type: d.regularEvent ?? 'skip',
        qty: d.qty ?? undefined, amount: d.regularEvent === 'rate_change' ? (d.rate ?? undefined) : undefined, createdAt: now }))
      continue
    }
    const entry: Entry = {
      date, kind: d.kind, amount: d.amount as number, mode: d.mode, source, createdAt: now,
      category: d.category ?? undefined, memberId: d.memberId ?? undefined,
      qty: d.qty ?? undefined, rate: d.rate ?? undefined, unit: d.unit ?? undefined,
      note: d.note ?? undefined, occasion: d.occasion ?? undefined,
    }
    if (d.accountName && (d.kind === 'credit_purchase' || d.kind === 'credit_payment')) entry.accountId = await findOrCreate('accounts', d.accountName)
    if (d.personName && d.kind.match(/loan|gift/)) entry.personId = await findOrCreate('people', d.personName)
    if (d.kind === 'regular_payment') { entry.regularId = d.regularId as number; entry.month = monthOf(date) }
    ref.entryIds.push(await db.entries.add(entry))
  }
  return ref
}

export interface CorrectionPlan { entry: Entry; field: 'amount' | 'category'; before: string | number; after: string | number }

export function planCorrection(result: ParseResult, recent: Entry[]): CorrectionPlan | null {
  const c = result.correction
  if (!c?.present || !c.new_value) return null
  const field = c.field === 'category' ? 'category' : 'amount'
  const hint = (c.target_hint ?? '').toLowerCase()
  const sorted = [...recent].sort((a, b) => b.createdAt - a.createdAt)
  const target = sorted.find((e) => hint && (e.category === hint || (e.note ?? '').toLowerCase().includes(hint)))
    ?? sorted[0]
  if (!target) return null
  if (field === 'amount') {
    const n = Number(String(c.new_value).replace(/[^\d.]/g, ''))
    if (!n) return null
    return { entry: target, field, before: target.amount, after: n }
  }
  return { entry: target, field, before: target.category ?? '', after: c.new_value }
}
