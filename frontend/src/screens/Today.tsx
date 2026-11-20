import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { db, mode, switchMode } from '../lib/db'
import { useHouse, useSettings } from '../lib/hooks'
import { addDays, formatDay, isEvening, todayStr } from '../lib/dates'
import { cashInHand, daySpend } from '../lib/ledger'
import { inr } from '../lib/money'
import { emoji, templateFor } from '../lib/categories'
import { blankDraft, commitDrafts, type Draft } from '../lib/drafts'
import { sampleUtterances, seedDemo, type SampleUtterance } from '../lib/demo'
import { modeLabel, regularName } from '../lib/display'
import type { Entry, RegularEvent } from '../lib/types'
import { MicIcon, Sheet, TabBar, toast } from '../components/ui'
import { VoiceSession } from '../components/VoiceSession'
import { EditDraftSheet } from '../components/EditDraftSheet'

function entryToDraft(e: Entry): Draft {
  return { ...blankDraft(e.kind), amount: e.amount, category: e.category ?? null, memberId: e.memberId ?? null, mode: e.mode,
    note: e.note ?? null, qty: e.qty ?? null, rate: e.rate ?? null, regularId: e.regularId ?? null, amountCheck: 'derived' }
}

export function Today() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const house = useHouse()
  const [date, setDate] = useState(todayStr())
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [sample, setSample] = useState<SampleUtterance | null>(null)
  const [sampleLive, setSampleLive] = useState(false)
  const [samplesOpen, setSamplesOpen] = useState(false)
  const [typing, setTyping] = useState<Draft | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [menu, setMenu] = useState<{ entry?: Entry; event?: RegularEvent } | null>(null)

  useEffect(() => { if (!voiceOpen) setSample(null) }, [voiceOpen])
  if (!settings) return null
  const lang = settings.displayLang
  const today = todayStr()
  const isToday = date === today
  const dayEntries = house.entries.filter((e) => e.date === date).sort((a, b) => b.createdAt - a.createdAt)
  const dayEvents = house.events.filter((e) => e.date === date && e.type !== 'came')
  const cash = cashInHand(house.entries, settings)
  const spent = daySpend(house.entries, date)
  const closed = house.dayCloses.some((d) => d.date === date)
  const liveRegs = house.regulars.filter((r) => !r.archived)
  const promptRegs = isToday && (settings.ritual !== 'evening' || isEvening() || new Date().getHours() >= 17)
    ? liveRegs.filter((r) => r.billing !== 'per_unit' && !house.events.some((e) => e.regularId === r.id && e.date === date))
    : []
  const regName = (id?: number) => { const r = house.regulars.find((x) => x.id === id); return r ? regularName(r, t) : '' }

  const label = (e: Entry) => {
    if (e.kind === 'regular_payment') return `${regName(e.regularId)}: ${t('kind.regular_payment')}`
    if (e.kind === 'credit_purchase' || e.kind === 'credit_payment') {
      return `${t(`kind.${e.kind}`)}: ${house.accounts.find((a) => a.id === e.accountId)?.name ?? ''}`
    }
    if (e.personId) return `${t(`kind.${e.kind}`)}: ${house.people.find((p) => p.id === e.personId)?.name ?? ''}`
    if (e.source === 'reconcile') return e.kind === 'income' ? t('cash.reconcileMore') : t('cash.reconcileLess')
    if (e.category && (e.kind === 'expense' || e.kind === 'income')) return e.note && e.category === 'other' ? e.note : t(`cat.${e.category}`)
    return t(`kind.${e.kind}`)
  }
  const icon = (e: Entry) => e.kind === 'regular_payment' ? templateFor(house.regulars.find((r) => r.id === e.regularId)?.template ?? '')?.emoji ?? '🔁'
    : e.kind.startsWith('loan') ? '🤝' : e.kind.startsWith('gift') ? '🎁' : e.kind.startsWith('cash') ? '🏦' : emoji(e.category)
  const sign = (e: Entry) => (['income', 'loan_repaid_to_us', 'gift_received', 'loan_taken', 'cash_withdrawal'].includes(e.kind) ? '+' : '')

  const markRegular = async (regularId: number, type: 'came' | 'skip' | 'leave') => {
    await db.regularEvents.add({ regularId, date, type, createdAt: Date.now() })
  }
  const closeDay = async () => {
    if (closed) await db.dayCloses.delete(date)
    else { await db.dayCloses.put({ date, closedAt: Date.now() }); toast(`✓ ${t('today.closed')}`) }
  }

  return (
    <div className="app">
      <div className="page">
        {mode === 'demo' && (
          <div className="banner">
            <span className="grow">👀 {t('today.demoBanner')}</span>
            <button className="chip tiny" onClick={() => switchMode('main', '#/')}>{t('today.exit')}</button>
          </div>
        )}
        <div className="topbar">
          <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label={t('common.prevDay')}>‹</button>
          <div className="grow center">
            <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{isToday ? t('common.today') : formatDay(date, i18n.language)}</div>
            {isToday && <div className="small muted">{formatDay(date, i18n.language)}</div>}
          </div>
          <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label={t('common.nextDay')}>›</button>
          <Link to="/settings" className="icon-btn" aria-label={t('settings.title')}>⚙️</Link>
        </div>

        <div className="card hero-card">
          <Link to="/accounts/cash" style={{ textDecoration: 'none' }}>
            <div className="label">💵 {t('today.cash')}</div>
            <div className="big">{inr(cash)}</div>
          </Link>
          <div>
            <div className="label">{isToday ? `${t('today.spent')} · ${t('common.today')}` : t('today.spent')}</div>
            <div className="big">{inr(spent)}</div>
          </div>
        </div>

        {mode === 'demo' && (
          <button className="btn secondary block mt" onClick={() => setSamplesOpen(true)}>🎧 {t('today.sample')}</button>
        )}

        {isToday && !closed && settings.ritual === 'evening' && isEvening() && (
          <button className="card flat mt row" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setVoiceOpen(true)}>
            <span className="emoji-dot" aria-hidden>🌙</span>
            <span className="grow"><b>{t('today.nudge')}</b><br /><span className="small muted">{t('today.nudgeSub')}</span></span>
            <span aria-hidden>🎤</span>
          </button>
        )}

        {promptRegs.map((r) => (
          <div key={r.id} className="card flat mt row">
            <span className="emoji-dot" aria-hidden>{templateFor(r.template)?.emoji ?? '🔁'}</span>
            <span className="grow" style={{ fontWeight: 600 }}>{t('today.prompt', { name: regularName(r, t) })}</span>
            <button className="chip tiny ok" onClick={() => markRegular(r.id as number, 'came')}>{t('today.came')}</button>
            <button className="chip tiny" onClick={() => markRegular(r.id as number, r.billing === 'monthly' ? 'leave' : 'skip')}>{t('today.notCame')}</button>
          </div>
        ))}

        <div className="h2">{t('today.written')}</div>
        {dayEntries.length === 0 && dayEvents.length === 0 ? (
          <div className="card flat empty">
            <div className="e">🎤</div>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{t('today.empty')}</div>
            <div className="small">{t('today.emptySub')}</div>
          </div>
        ) : (
          <div className="card">
            <ul className="list">
              {dayEvents.map((ev) => (
                <li key={`ev${ev.id}`} className="item">
                  <span className="emoji-dot" aria-hidden>{templateFor(house.regulars.find((r) => r.id === ev.regularId)?.template ?? '')?.emoji ?? '🔁'}</span>
                  <div className="grow"><div className="title">{regName(ev.regularId)}</div>
                    <div className="sub">{t(`regev.${ev.type}`, { qty: ev.qty ?? '', amount: ev.amount ?? '', rate: ev.amount ?? '' })}</div></div>
                  <button className="mini-btn" onClick={() => setMenu({ event: ev })} aria-label={t('common.more')}>⋯</button>
                </li>
              ))}
              {dayEntries.map((e) => {
                const who = house.members.find((m) => m.id === e.memberId)?.name
                return (
                  <li key={e.id} className="item">
                    <span className="emoji-dot" aria-hidden>{icon(e)}</span>
                    <div className="grow">
                      <div className="title">{label(e)}</div>
                      <div className="sub">{[who, e.mode !== 'cash' ? modeLabel(e.mode, t) : null, e.note && e.category !== 'other' && e.source !== 'reconcile' ? e.note : null].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className="amount">{sign(e)}{inr(e.amount)}</span>
                    <button className="mini-btn" onClick={() => setMenu({ entry: e })} aria-label={t('common.more')}>⋯</button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {date <= today && (dayEntries.length > 0 || dayEvents.length > 0 || closed) && (
          <div className="center mt-l">
            {closed
              ? <div className="row" style={{ justifyContent: 'center' }}><span className="closed-pill">✓ {t('today.closed')}</span><button className="link-btn" onClick={closeDay}>{t('today.reopen')}</button></div>
              : <button className="btn dark" onClick={closeDay}>✓ {t('today.closeDay')}</button>}
          </div>
        )}
      </div>

      <div className="mic-fab">
        <button className="mic-btn" onClick={() => setVoiceOpen(true)} aria-label={t('mic.tap')}><MicIcon /></button>
        <button className="link-btn type-link" onClick={() => setTyping(blankDraft())}>⌨️ {t('common.typeInstead')}</button>
      </div>
      <TabBar />

      <VoiceSession open={voiceOpen} house={house} settings={settings} baseDate={date} sample={sample} sampleLive={sampleLive}
        onClose={() => setVoiceOpen(false)} />

      <EditDraftSheet open={!!typing} draft={typing} members={house.members} regulars={house.regulars} settings={settings}
        onClose={() => setTyping(null)}
        onSave={async (d) => { const r = await commitDrafts([d], date, 'typed'); setTyping(null); if (r.entryIds.length || r.eventIds.length) toast(t('confirm.saved')) }} />

      <EditDraftSheet open={!!editing} draft={editing ? entryToDraft(editing) : null} members={house.members} regulars={house.regulars}
        settings={settings} title={t('common.edit')} onClose={() => setEditing(null)}
        onSave={async (d) => {
          if (!editing?.id || !d.amount) return
          await db.entries.update(editing.id, { amount: d.amount, category: d.category ?? undefined, memberId: d.memberId ?? undefined,
            mode: d.mode, kind: d.kind === 'regular_event' ? editing.kind : d.kind })
          setEditing(null)
          toast(t('confirm.saved'))
        }} />

      <Sheet open={!!menu} onClose={() => setMenu(null)}>
        <div className="sheet-actions" style={{ position: 'static' }}>
          {menu?.entry && <button className="btn secondary block" onClick={() => { setEditing(menu.entry ?? null); setMenu(null) }}>✎ {t('common.edit')}</button>}
          <button className="btn danger block" onClick={async () => {
            if (!window.confirm(`${t('common.delete')}?${menu?.entry ? ` ${inr(menu.entry.amount)}` : ''}`)) return
            if (menu?.entry?.id) await db.entries.delete(menu.entry.id)
            if (menu?.event?.id) await db.regularEvents.delete(menu.event.id)
            setMenu(null)
          }}>🗑 {t('common.delete')}</button>
          <button className="btn ghost block" onClick={() => setMenu(null)}>{t('common.cancel')}</button>
        </div>
      </Sheet>

      <Sheet open={samplesOpen} onClose={() => setSamplesOpen(false)}>
        <h2>🎧 {t('today.sample')}</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className={`chip tiny${!sampleLive ? ' on' : ''}`} onClick={() => setSampleLive(false)}>💾 {t('today.sampleSaved')}</button>
          <button className={`chip tiny${sampleLive ? ' on' : ''}`} onClick={() => setSampleLive(true)}>⚡ {t('today.sampleLive')}</button>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>{t('today.sampleNote')}</p>
        {sampleUtterances(lang).map((s) => (
          <button key={s.id} className="choice" onClick={() => { setSample(s); setSamplesOpen(false); setVoiceOpen(true) }}>
            <span className="e">🗣️</span><span className="grow small">“{s.text}”</span>
          </button>
        ))}
        <button className="link-btn mt" onClick={async () => { await seedDemo(lang); window.location.reload() }}>↺ {t('today.sampleReset')}</button>
      </Sheet>
      <span className="sr-only">{lang}</span>
    </div>
  )
}
