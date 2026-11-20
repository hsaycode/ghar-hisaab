import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS } from './db'
import type { Settings } from './types'

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const row = await db.meta.get('settings')
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
  }, [])
}

export function useHouse() {
  const members = useLiveQuery(() => db.members.toArray(), []) ?? []
  const regulars = useLiveQuery(() => db.regulars.toArray(), []) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? []
  const events = useLiveQuery(() => db.regularEvents.toArray(), []) ?? []
  const statements = useLiveQuery(() => db.statements.toArray(), []) ?? []
  const dayCloses = useLiveQuery(() => db.dayCloses.toArray(), []) ?? []
  return { members, regulars, accounts, people, entries, events, statements, dayCloses }
}

export type House = ReturnType<typeof useHouse>
