import Dexie, { type Table } from 'dexie'
import type {
  Account, CashCount, DayClose, Entry, Member, Person, Regular, RegularEvent, Settings, Statement, VendorHouse,
} from './types'
import { todayStr } from './dates'

export interface MetaRow { key: string; value: unknown }

export class HisaabDB extends Dexie {
  members!: Table<Member, number>
  entries!: Table<Entry, number>
  regulars!: Table<Regular, number>
  regularEvents!: Table<RegularEvent, number>
  accounts!: Table<Account, number>
  people!: Table<Person, number>
  cashCounts!: Table<CashCount, number>
  dayCloses!: Table<DayClose, string>
  statements!: Table<Statement, string>
  vendorHouses!: Table<VendorHouse, string>
  meta!: Table<MetaRow, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      members: '++id',
      entries: '++id, date, kind, regularId, accountId, personId, [regularId+month]',
      regulars: '++id',
      regularEvents: '++id, regularId, date, [regularId+date]',
      accounts: '++id',
      people: '++id',
      cashCounts: '++id, date',
      dayCloses: 'date',
      statements: 'sid, regularId',
      vendorHouses: 'sid',
      meta: 'key',
    })
  }
}

const MODE_KEY = 'gh-mode'

function readMode(): 'main' | 'demo' {
  try {
    return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'main'
  } catch {
    return 'main'
  }
}

export const mode = readMode()
export const db = new HisaabDB(mode === 'demo' ? 'gh-demo' : 'gh-main')

export function switchMode(next: 'main' | 'demo', hash = '#/today') {
  try { localStorage.setItem(MODE_KEY, next) } catch { /* ignore */ }
  window.location.hash = hash
  window.location.reload()
}

export const DEFAULT_SETTINGS: Settings = {
  displayLang: 'hi',
  speechLang: 'hi',
  textSize: 'L',
  readAloud: true,
  nightMode: 'auto',
  ritual: 'evening',
  usage: ['daily', 'regular', 'khata', 'lena', 'income'],
  openingCash: 0,
  openingCashDate: todayStr(),
  houseAlias: '',
  onboarded: false,
  role: null,
  onboardingStep: 0,
}

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings()
  await db.meta.put({ key: 'settings', value: { ...cur, ...patch } })
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist()
  } catch { /* ignore */ }
}
