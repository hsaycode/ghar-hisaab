export type Lang = 'en' | 'hi' | 'mr' | 'bn' | 'te' | 'ta'
export const LANGS: Lang[] = ['hi', 'en', 'mr', 'bn', 'te', 'ta']

export type Kind =
  | 'expense' | 'income' | 'cash_withdrawal' | 'cash_deposit'
  | 'loan_given' | 'loan_taken' | 'loan_repaid_to_us' | 'loan_repaid_by_us'
  | 'gift_given' | 'gift_received' | 'credit_purchase' | 'credit_payment' | 'regular_payment'

export type Mode = 'cash' | 'upi' | 'card' | 'bank'
export type Source = 'voice' | 'typed' | 'sms' | 'reconcile' | 'demo'

export interface Entry {
  id?: number
  date: string              // YYYY-MM-DD
  kind: Kind
  amount: number
  qty?: number
  rate?: number
  unit?: string
  category?: string
  memberId?: number
  mode: Mode
  personId?: number
  accountId?: number
  regularId?: number
  month?: string            // YYYY-MM for regular_payment
  occasion?: string
  note?: string
  source: Source
  createdAt: number
}

export type Billing = 'daily_qty' | 'per_unit' | 'monthly'

export interface Regular {
  id?: number
  name: string
  nameKey: string
  template: string          // milk | newspaper | maid | cook | press | water | other
  autoName?: boolean        // true: display the template's name in the current UI language
  category: string
  billing: Billing
  rate: number              // per unit, or per month for 'monthly'
  unit: string
  defaultQty: number        // daily_qty only
  deductLeaves: boolean     // monthly only; opt-in
  allowedLeaves: number
  vendorLang?: Lang
  phone?: string
  startDate: string
  pauses: { from: string; to: string }[]
  archived?: boolean
  createdAt: number
}

export type RegularEventType = 'skip' | 'extra' | 'less' | 'units' | 'leave' | 'half_leave' | 'advance' | 'rate_change' | 'came'

export interface RegularEvent {
  id?: number
  regularId: number
  date: string
  type: RegularEventType
  qty?: number
  amount?: number
  createdAt: number
}

export interface Named { id?: number; name: string; nameKey: string; archived?: boolean; createdAt: number }
export type Account = Named
export type Person = Named
export type Member = Named

export interface CashCount { id?: number; date: string; counted: number; expected: number; createdAt: number }
export interface DayClose { date: string; closedAt: number }

export interface Statement {
  sid: string
  regularId: number
  month: string
  hash: string
  total: number
  status: 'sent' | 'confirmed' | 'disputed' | 'paid'
  disputedDays?: number[]
  note?: string
  sentAt: number
  respondedAt?: number
}

export interface StatementPayload {
  v: 1
  sid: string
  ha: string        // house alias
  rn: string        // regular name
  tp: string        // template
  mo: string        // YYYY-MM
  b: Billing
  u: string         // unit
  r: number         // rate (latest)
  d: string         // per-day codes, comma separated
  t: number         // total
  lg: Lang
  exp: number       // expiry epoch ms
  ded?: number      // leave deduction
  adv?: number      // advance deducted
}

export interface VendorHouse {
  sid: string
  hash: string
  payload: StatementPayload
  status: 'new' | 'confirmed' | 'disputed'
  receivedAt: number
}

export type Ritual = 'morning' | 'afternoon' | 'evening' | 'any'
export type Usage = 'daily' | 'regular' | 'khata' | 'lena' | 'income' | 'farm'

export interface Settings {
  displayLang: Lang
  speechLang: Lang
  textSize: 'L' | 'XL'
  readAloud: boolean
  nightMode: 'auto' | 'on' | 'off'
  ritual: Ritual
  usage: Usage[]
  openingCash: number
  openingCashDate: string
  houseAlias: string
  onboarded: boolean
  role: 'household' | 'vendor' | null
  onboardingStep: number
}
