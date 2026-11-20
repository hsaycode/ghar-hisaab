// Regression guard: every UI string must come from the translation files, and every language
// must have every key, so choosing English (or Tamil, …) shows only that language.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'
import hi from './hi.json'
import mr from './mr.json'
import bn from './bn.json'
import te from './te.json'
import ta from './ta.json'

type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]))
const INDIC = /[ऀ-෿]/
const SRC = join(__dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]))
}

describe('i18n', () => {
  const enKeys = flat(en as Tree)
  it.each([['hi', hi], ['mr', mr], ['bn', bn], ['te', te], ['ta', ta]])('%s has every key', (_, data) => {
    const keys = new Set(flat(data as Tree))
    expect(enKeys.filter((k) => !keys.has(k))).toEqual([])
  })

  it('no hardcoded Indic-script text in screens or components', () => {
    const offenders = files(SRC)
      .filter((f) => /\.(tsx|ts)$/.test(f) && !f.includes('i18n') && !f.endsWith('.test.ts'))
      .filter((f) => !/[\\/]lib[\\/](demo|names|categories)\.ts$/.test(f))   // localized data tables, keyed by language
      .filter((f) => INDIC.test(readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))
    expect(offenders).toEqual([])
  })

  it('no hardcoded English aria-labels or uppercased codes in screens', () => {
    const offenders = files(SRC)
      .filter((f) => /\.tsx$/.test(f) && !/[\\/](Lab|Evals)\.tsx$/.test(f))
      .filter((f) => /aria-label="[A-Za-z]|\.toUpperCase\(\)|'Ghar'/.test(readFileSync(f, 'utf-8')))
    expect(offenders).toEqual([])
  })

  it('no CSS utility class is redefined by a component rule', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf-8')
    const standalone = css.match(/^\.[a-z][a-z0-9-]* \{/gm) ?? []
    const dupes = standalone.filter((s, i) => standalone.indexOf(s) !== i)
    expect(dupes).toEqual([])
  })

  it('no em dashes in user-facing copy', () => {
    for (const data of [en, hi, mr, bn, te, ta]) expect(JSON.stringify(data)).not.toContain('—')
  })
})
