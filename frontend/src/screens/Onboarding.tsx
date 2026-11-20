import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import i18n, { BETA_LANGS, LANGUAGE_NAMES } from '../i18n'
import { db, requestPersistence, saveSettings } from '../lib/db'
import { REGULAR_TEMPLATES, type RegularTemplate } from '../lib/categories'
import { nameKey } from '../lib/names'
import { todayStr } from '../lib/dates'
import { micSupported } from '../lib/voice'
import { useHouse, useSettings } from '../lib/hooks'
import type { Lang, Ritual, Settings, Usage } from '../lib/types'
import { LANGS } from '../lib/types'
import { NumberPad } from '../components/ui'
import { VoiceSession } from '../components/VoiceSession'

const STEPS = ['lang', 'members', 'usage', 'regulars', 'khata', 'cash', 'voice', 'ritual', 'done'] as const
type Step = typeof STEPS[number]

interface RegDraft { on: boolean; name: string; rate: string; qty: string }

export function Onboarding() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const settings = useSettings()
  const house = useHouse()
  const [i, setI] = useState(0)
  const step: Step = STEPS[i]
  const [lang, setLang] = useState<Lang>('hi')
  const [houseAlias, setHouseAlias] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [memberInput, setMemberInput] = useState('')
  const [usage, setUsage] = useState<Usage[]>(['daily', 'regular', 'khata', 'lena', 'income'])
  const [regs, setRegs] = useState<Record<string, RegDraft>>({})
  const [shops, setShops] = useState<string[]>([])
  const [shopInput, setShopInput] = useState('')
  const [cash, setCash] = useState('')
  const [ritual, setRitual] = useState<Ritual>('evening')
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [practiced, setPracticed] = useState(false)

  useEffect(() => {
    if (!settings) return
    setLang(settings.displayLang)
  }, [settings?.displayLang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRegs((cur) => {
      const next = { ...cur }
      for (const tpl of REGULAR_TEMPLATES) {
        if (!next[tpl.id]) next[tpl.id] = { on: tpl.id === 'milk', name: '', rate: String(tpl.rate), qty: String(tpl.defaultQty) }
      }
      return next
    })
  }, [])

  const suggestions = useMemo(() => t('onb.members.suggest').split('|'), [t, lang])

  if (!settings) return null

  const pickLang = (l: Lang) => { setLang(l); void i18n.changeLanguage(l); void saveSettings({ displayLang: l, speechLang: l }) }
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const next = () => setI((n) => Math.min(STEPS.length - 1, n + 1))
  const back = () => (i === 0 ? nav('/') : setI((n) => n - 1))

  const finish = async () => {
    await requestPersistence()
    const now = Date.now()
    await db.transaction('rw', [db.members, db.regulars, db.accounts, db.meta], async () => {
      if (!house.members.length) {
        for (const m of members) await db.members.add({ name: m, nameKey: nameKey(m), createdAt: now })
      }
      if (!house.regulars.length) {
        for (const tpl of REGULAR_TEMPLATES) {
          const r = regs[tpl.id]
          if (!r?.on) continue
          const name = r.name.trim() || t(`tpl.${tpl.id}`)
          await db.regulars.add({ name, nameKey: nameKey(name), autoName: !r.name.trim(), template: tpl.id, category: tpl.category, billing: tpl.billing,
            rate: Number(r.rate) || tpl.rate, unit: tpl.unit, defaultQty: Number(r.qty) || tpl.defaultQty || 1,
            deductLeaves: false, allowedLeaves: 2, vendorLang: lang, startDate: todayStr(), pauses: [], createdAt: now })
        }
      }
      if (!house.accounts.length) {
        for (const s of shops) await db.accounts.add({ name: s, nameKey: nameKey(s), createdAt: now })
      }
    })
    const patch: Partial<Settings> = { onboarded: true, role: 'household', displayLang: lang, speechLang: lang, usage, ritual,
      nightMode: 'auto', openingCash: Number(cash) || 0, openingCashDate: todayStr(), houseAlias: houseAlias.trim() }
    await saveSettings(patch)
    nav('/today')
  }

  const art: Record<Step, string> = { lang: '🗣️', members: '👪', usage: '📒', regulars: '🥛', khata: '🛒', cash: '💵', voice: '🎤', ritual: '🌙', done: '✨' }
  const canContinue = step !== 'members' || members.length > 0

  const regRow = (tpl: RegularTemplate) => {
    const r = regs[tpl.id]
    if (!r) return null
    const set = (p: Partial<RegDraft>) => setRegs({ ...regs, [tpl.id]: { ...r, ...p } })
    return (
      <div key={tpl.id} className={`reg-card${r.on ? ' on' : ''}`}>
        <button className="row" style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
          onClick={() => set({ on: !r.on })} aria-pressed={r.on}>
          <span className="emoji-dot" aria-hidden>{tpl.emoji}</span>
          <span className="grow" style={{ fontWeight: 700 }}>{t(`tpl.${tpl.id}`)}</span>
          <span className={`chip tiny${r.on ? ' on' : ''}`}>{r.on ? `✓ ${t('onb.regulars.added')}` : `+ ${t('common.add')}`}</span>
        </button>
        {r.on && (
          <div className="reg-fields">
            <label style={{ gridColumn: '1 / -1' }}>{t('onb.regulars.namePlaceholder')}
              <input value={r.name} placeholder={t(`tpl.${tpl.id}`)} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label>{t('onb.regulars.rate')} {tpl.billing === 'monthly' ? t('onb.regulars.monthly') : t('onb.regulars.perUnit', { unit: t(`unit.${tpl.unit}`) })}
              <input inputMode="numeric" value={r.rate} onChange={(e) => set({ rate: e.target.value.replace(/[^\d.]/g, '') })} />
            </label>
            {tpl.billing === 'daily_qty' && (
              <label>{t('onb.regulars.qty')} ({t(`unit.${tpl.unit}`)})
                <input inputMode="decimal" value={r.qty} onChange={(e) => set({ qty: e.target.value.replace(/[^\d.]/g, '') })} />
              </label>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <div className="onb">
        <div className="onb-top">
          <button className="icon-btn" onClick={back} aria-label={t('common.back')}>←</button>
          <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1}>
            <i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
          </div>
          <span className="small muted">{t('onb.step', { n: i + 1, total: STEPS.length })}</span>
        </div>

        <div className="onb-body" key={step}>
          <div className="onb-art" aria-hidden>{art[step]}</div>

          {step === 'lang' && (
            <>
              <h1>{t('onb.lang.title')}</h1>
              <p className="lead">{t('onb.lang.sub')}</p>
              <div className="lang-grid">
                {LANGS.map((l) => (
                  <button key={l} className={`lang-btn${lang === l ? ' on' : ''}`} onClick={() => pickLang(l)} aria-pressed={lang === l}>
                    <b>{LANGUAGE_NAMES[l].native}</b>
                    <span className="small muted">{LANGUAGE_NAMES[l].english}{BETA_LANGS.includes(l) ? ` · ${t('common.beta')}` : ''}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'members' && (
            <>
              <h1>{t('onb.members.title')}</h1>
              <p className="lead">{t('onb.members.sub')}</p>
              <div className="row wrap">
                {[...new Set([...suggestions, ...members])].map((m) => (
                  <button key={m} className={`chip${members.includes(m) ? ' on' : ''}`} onClick={() => setMembers(toggle(members, m))}>
                    {members.includes(m) ? '✓ ' : ''}{m}
                  </button>
                ))}
              </div>
              <form className="row mt" onSubmit={(e) => { e.preventDefault(); const v = memberInput.trim(); if (v) { setMembers([...new Set([...members, v])]); setMemberInput('') } }}>
                <input className="field grow" value={memberInput} placeholder={t('onb.members.placeholder')} onChange={(e) => setMemberInput(e.target.value)} />
                <button className="btn secondary small" type="submit">{t('common.add')}</button>
              </form>
              <div className="h2">{t('onb.members.house')}</div>
              <input className="field" value={houseAlias} placeholder={t('onb.members.housePlaceholder')} onChange={(e) => setHouseAlias(e.target.value)} />
            </>
          )}

          {step === 'usage' && (
            <>
              <h1>{t('onb.usage.title')}</h1>
              <p className="lead">{t('onb.usage.sub')}</p>
              {([['daily', '🧾'], ['regular', '🥛'], ['khata', '🛒'], ['lena', '🤝'], ['income', '🏦'], ['farm', '🌾']] as [Usage, string][]).map(([u, e]) => (
                <button key={u} className={`choice${usage.includes(u) ? ' on' : ''}`} onClick={() => setUsage(toggle(usage, u))} aria-pressed={usage.includes(u)}>
                  <span className="e" aria-hidden>{e}</span>{t(`onb.usage.${u}`)}<span className="tick">✓</span>
                </button>
              ))}
            </>
          )}

          {step === 'regulars' && (
            <>
              <h1>{t('onb.regulars.title')}</h1>
              <p className="lead">{t('onb.regulars.sub')}</p>
              {REGULAR_TEMPLATES.map(regRow)}
            </>
          )}

          {step === 'khata' && (
            <>
              <h1>{t('onb.khata.title')}</h1>
              <p className="lead">{t('onb.khata.sub')}</p>
              <div className="row wrap">
                {shops.map((s) => <button key={s} className="chip on" onClick={() => setShops(shops.filter((x) => x !== s))}>🛒 {s} ✕</button>)}
              </div>
              <form className="row mt" onSubmit={(e) => { e.preventDefault(); const v = shopInput.trim(); if (v) { setShops([...new Set([...shops, v])]); setShopInput('') } }}>
                <input className="field grow" value={shopInput} placeholder={t('onb.khata.placeholder')} onChange={(e) => setShopInput(e.target.value)} />
                <button className="btn secondary small" type="submit">{t('common.add')}</button>
              </form>
            </>
          )}

          {step === 'cash' && (
            <>
              <h1>{t('onb.cash.title')}</h1>
              <p className="lead">{t('onb.cash.sub')}</p>
              <div className="amount-display">₹{cash || '0'}</div>
              <NumberPad value={cash} onChange={setCash} />
            </>
          )}

          {step === 'voice' && (
            <>
              <h1>{t('onb.voice.title')}</h1>
              <p className="lead">{t('onb.voice.sub')}</p>
              {micSupported() ? (
                <div className="card center">
                  <p className="small muted" style={{ margin: 0 }}>{t('onb.voice.try')}</p>
                  <p style={{ fontSize: '1.3rem', fontWeight: 800, margin: '6px 0 14px' }}>“{t('onb.voice.example')}”</p>
                  <button className="mic-btn" style={{ margin: '0 auto' }} onClick={() => setPracticeOpen(true)} aria-label={t('onb.voice.tap')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
                  </button>
                  <p className="small" style={{ fontWeight: 700, marginTop: 10 }}>{practiced ? `✅ ${t('onb.voice.great')}` : t('onb.voice.tap')}</p>
                  <p className="small muted">{t('onb.voice.allow')}</p>
                </div>
              ) : <div className="banner warn">{t('onb.voice.noMic')}</div>}
              <p className="small muted mt">{t('onb.voice.note')}</p>
            </>
          )}

          {step === 'ritual' && (
            <>
              <h1>{t('onb.ritual.title')}</h1>
              {([['morning', '🌅'], ['afternoon', '☀️'], ['evening', '🌙'], ['any', '🕰️']] as [Ritual, string][]).map(([r, e]) => (
                <button key={r} className={`choice${ritual === r ? ' on' : ''}`} onClick={() => setRitual(r)} aria-pressed={ritual === r}>
                  <span className="e" aria-hidden>{e}</span>{t(`onb.ritual.${r}`)}<span className="tick">✓</span>
                </button>
              ))}
              {ritual === 'evening' && <p className="small muted mt">{t('onb.ritual.night')}</p>}
            </>
          )}

          {step === 'done' && (
            <>
              <h1>{t('onb.done.title')}</h1>
              <p className="lead">{t('onb.done.sub')}</p>
              <div className="card">
                <div className="label">{t('onb.done.summary')}</div>
                <ul className="list">
                  <li className="item"><span className="emoji-dot">👪</span><span className="grow">{members.join(', ')}</span></li>
                  <li className="item"><span className="emoji-dot">🥛</span><span className="grow">{REGULAR_TEMPLATES.filter((x) => regs[x.id]?.on).map((x) => regs[x.id].name || t(`tpl.${x.id}`)).join(', ') || t('accounts.none')}</span></li>
                  <li className="item"><span className="emoji-dot">🛒</span><span className="grow">{shops.join(', ') || t('onb.khata.none')}</span></li>
                  <li className="item"><span className="emoji-dot">💵</span><span className="grow">₹{cash || '0'}</span></li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="onb-foot">
          {step === 'done'
            ? <button className="btn primary block" onClick={finish}>{t('onb.done.go')}</button>
            : <button className="btn primary block" onClick={next} disabled={!canContinue}>{t('common.continue')}</button>}
          {step === 'cash' && <button className="link-btn" onClick={() => { setCash(''); next() }}>{t('onb.cash.later')}</button>}
          {step === 'khata' && shops.length === 0 && <button className="link-btn" onClick={next}>{t('onb.khata.none')}</button>}
          {step === 'voice' && !practiced && <button className="link-btn" onClick={next}>{t('common.skip')}</button>}
        </div>
      </div>

      <VoiceSession open={practiceOpen} practice house={{ members: [], regulars: [], accounts: [], people: [], entries: [] }}
        settings={{ ...settings, displayLang: lang, speechLang: lang, readAloud: true }} baseDate={todayStr()}
        onPracticeDone={() => setPracticed(true)} onClose={() => setPracticeOpen(false)} />
    </div>
  )
}
