import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/db'
import { useHouse, useSettings } from '../lib/hooks'
import { monthBill, paidFor, type DayInfo } from '../lib/billing'
import { addMonths, formatMonth, monthOf, parseYmd, todayStr } from '../lib/dates'
import { inr, num } from '../lib/money'
import { templateFor } from '../lib/categories'
import { appBase, buildPayload, encodePayload, newSid, payloadHash, waLink } from '../lib/statement'
import { tIn, LANGUAGE_NAMES } from '../i18n'
import type { Lang, RegularEventType } from '../lib/types'
import { LANGS } from '../lib/types'
import { NumberPad, Sheet, TabBar, Topbar, toast } from '../components/ui'
import { regularName, weekdayLetters } from '../lib/display'

const MARK: Partial<Record<DayInfo['status'], string>> = { came: '●', skipped: '○', extra: '⊕', less: '◐', units: '●', present: '●', leave: '○', half: '◐', paused: '–' }

export function RegularDetail() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const nav = useNavigate()
  const settings = useSettings()
  const house = useHouse()
  const [ym, setYm] = useState(monthOf(todayStr()))
  const [day, setDay] = useState<DayInfo | null>(null)
  const [units, setUnits] = useState('')
  const [sheet, setSheet] = useState<null | 'rate' | 'away' | 'pay' | 'settings'>(null)
  const [val, setVal] = useState('')
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const reg = house.regulars.find((r) => String(r.id) === id)
  if (!settings || !reg) return null
  const today = todayStr()
  const upTo = ym === monthOf(today) ? today : undefined
  const bill = monthBill(reg, house.events, ym, upTo)
  const paid = paidFor(house.entries, reg.id as number, ym)
  const due = Math.max(0, bill.total - paid)
  const statement = house.statements.filter((s) => s.regularId === reg.id && s.month === ym).sort((a, b) => b.sentAt - a.sentAt)[0]
  const tpl = templateFor(reg.template)
  const firstDow = parseYmd(`${ym}-01`).getDay()
  const unitLabel = t(`unit.${reg.unit}`, { defaultValue: reg.unit })

  const setDayEvent = async (date: string, type: RegularEventType | null, qty?: number) => {
    const existing = house.events.filter((e) => e.regularId === reg.id && e.date === date && e.type !== 'rate_change')
    await db.regularEvents.bulkDelete(existing.map((e) => e.id as number))
    if (type) await db.regularEvents.add({ regularId: reg.id as number, date, type, qty, createdAt: Date.now() })
    setDay(null)
  }

  const share = async () => {
    const vlang: Lang = reg.vendorLang ?? settings.displayLang
    const sid = newSid()
    const service = reg.autoName ? tIn(vlang, `tpl.${reg.template}`) : reg.name   // in the vendor's language
    const house = settings.houseAlias || tIn(vlang, 'app.name')
    const payload = buildPayload(reg, bill, house, vlang, sid, paid, service)
    const hash = await payloadHash(payload)
    const link = `${appBase()}#/v/${await encodePayload(payload)}`
    const month = formatMonth(ym, vlang)
    const detail = reg.billing === 'monthly'
      ? tIn(vlang, 'wa.detailDays', { n: bill.days.filter((d) => d.status === 'present' || d.status === 'half').length })
      : `${num(bill.units)} ${tIn(vlang, `unit.${reg.unit}`, { defaultValue: reg.unit })}`
    const text = [
      tIn(vlang, 'wa.bill', { house, service, month, detail, total: num(bill.total) }),
      tIn(vlang, 'wa.replyHint'),
      tIn(vlang, 'wa.check', { link }),
      tIn(vlang, 'wa.safety'),
    ].join('\n')
    await db.statements.put({ sid, regularId: reg.id as number, month: ym, hash, total: bill.total, status: 'sent', sentAt: Date.now() })
    window.open(waLink(reg.phone, text), '_blank', 'noopener')
  }

  const markPaid = async (mode: 'cash' | 'upi') => {
    const amount = Number(val) || due
    if (!amount) return
    await db.entries.add({ date: today, kind: 'regular_payment', amount, mode, regularId: reg.id as number, month: ym, source: 'typed', createdAt: Date.now() })
    if (statement) await db.statements.update(statement.sid, { status: 'paid' })
    setSheet(null); setVal(''); toast(t('confirm.saved'))
  }

  return (
    <div className="app">
      <div className="page">
        <Topbar title={regularName(reg, t)} back={() => nav('/accounts')} right={<button className="icon-btn" onClick={() => setSheet('settings')} aria-label={t('settings.title')}>⚙️</button>} />
        <div className="row" style={{ gap: 8, marginTop: -6, marginBottom: 14 }}>
          <span className="badge">{tpl?.emoji} {t(`tpl.${reg.template}`)}</span>
          <span className="badge">{t('regular.rate')}: {inr(bill.rateNow)}{reg.billing === 'monthly' ? ` / ${t('unit.month')}` : ` / ${unitLabel}`}</span>
        </div>

        <div className="card">
          <div className="row between">
            <button className="icon-btn" onClick={() => setYm(addMonths(ym, -1))} aria-label={t('common.prevMonth')}>‹</button>
            <div style={{ fontWeight: 800 }}>{formatMonth(ym, i18n.language)}</div>
            <button className="icon-btn" onClick={() => setYm(addMonths(ym, 1))} disabled={ym >= monthOf(today)} aria-label={t('common.nextMonth')}>›</button>
          </div>
          <div className="cal mt">
            {weekdayLetters(i18n.language).map((d, k) => <div key={k} className="dow">{d}</div>)}
            {Array.from({ length: firstDow }).map((_, k) => <div key={`b${k}`} />)}
            {bill.days.map((d) => {
              const dn = Number(d.date.slice(8))
              const disputed = statement?.disputedDays?.includes(dn)
              const clickable = d.status !== 'future' && d.status !== 'before'
              return (
                <button key={d.date} className={`day ${d.status}${d.date === today ? ' today' : ''}${disputed ? ' disputed' : ''}`}
                  disabled={!clickable} onClick={() => { setDay(d); setUnits(d.qty ? String(d.qty) : '') }}
                  aria-label={`${dn}: ${d.status}${d.qty ? ` ${d.qty}` : ''}`}>
                  <span>{dn}</span><span className="mark" aria-hidden>{MARK[d.status] ?? ''}{reg.billing !== 'monthly' && d.qty && d.qty !== reg.defaultQty ? '' : ''}</span>
                </button>
              )
            })}
          </div>
          <div className="legend">
            <span>● {t('regular.legendCame')}</span><span>○ {reg.billing === 'monthly' ? t('regular.legendLeave') : t('regular.legendSkip')}</span>
            {reg.billing === 'daily_qty' && <span>⊕ {t('regular.legendExtra')}</span>}
          </div>
        </div>

        <div className="h2">{t('regular.bill', { month: formatMonth(ym, i18n.language) })}</div>
        <div className="card">
          {reg.billing !== 'monthly' ? (
            <div className="row between"><span>{t('regular.lineQty', { qty: num(bill.units), unit: unitLabel, rate: num(bill.rateNow) })}</span><span className="amount">{inr(bill.total)}</span></div>
          ) : (
            <>
              <div className="row between"><span>{t('regular.lineBase')}</span><span className="amount">{inr(bill.base)}</span></div>
              {bill.deduction > 0 && <div className="row between mt"><span>{t('regular.lineDeduct')} ({bill.leaves})</span><span className="amount">−{inr(bill.deduction)}</span></div>}
              {bill.leaves > 0 && !bill.deduction && <div className="small muted mt">{t('regular.leave')}: {bill.leaves}</div>}
            </>
          )}
          {paid > 0 && <div className="row between mt"><span>{t('accounts.paid')}</span><span className="amount">−{inr(paid)}</span></div>}
          <div className="row between mt" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <b>{t('accounts.due', { amount: '' })}</b><span className="big">{inr(due)}</span>
          </div>
          {statement && (
            <div className="banner mt" style={{ marginBottom: 0 }}>
              {t(`regular.status_${statement.status}`)}
              {statement.disputedDays?.length ? ` · ${t('regular.disputedDays', { days: statement.disputedDays.join(', ') })}` : ''}
              {statement.note ? ` · “${statement.note}”` : ''}
            </div>
          )}
        </div>

        <div className="stack mt">
          <button className="btn primary block" onClick={share}>💬 {t('regular.share')}</button>
          <button className="btn secondary block" onClick={() => { setVal(String(due || '')); setSheet('pay') }}>✓ {t('regular.markPaid')}</button>
          <div className="row">
            <button className="btn ghost grow small" onClick={() => { setVal(''); setSheet('rate') }}>{t('regular.changeRate')}</button>
            <button className="btn ghost grow small" onClick={() => setSheet('away')}>{t('regular.away')}</button>
          </div>
        </div>
      </div>
      <TabBar />

      <Sheet open={!!day} onClose={() => setDay(null)}>
        {day && (
          <>
            <h2>{day.date.slice(8)} {formatMonth(ym, i18n.language)}</h2>
            {reg.billing === 'daily_qty' && (
              <div className="stack">
                <button className="btn success block" onClick={() => setDayEvent(day.date, null)}>● {t('regular.came')} ({num(reg.defaultQty)} {unitLabel})</button>
                <button className="btn danger block" onClick={() => setDayEvent(day.date, 'skip')}>○ {t('regular.skip')}</button>
                <div className="row">
                  <button className="btn ghost grow" onClick={() => setDayEvent(day.date, 'extra', 0.5)}>+½ {unitLabel}</button>
                  <button className="btn ghost grow" onClick={() => setDayEvent(day.date, 'extra', 1)}>+1 {unitLabel}</button>
                  <button className="btn ghost grow" onClick={() => setDayEvent(day.date, 'less', 0.5)}>−½</button>
                </div>
              </div>
            )}
            {reg.billing === 'per_unit' && (
              <>
                <div className="label">{t('regular.units')}</div>
                <div className="amount-display">{units || '0'} <span className="small muted">{unitLabel}</span></div>
                <NumberPad value={units} onChange={setUnits} />
                <div className="sheet-actions"><button className="btn primary block" onClick={() => setDayEvent(day.date, Number(units) ? 'units' : null, Number(units) || undefined)}>{t('common.save')}</button></div>
              </>
            )}
            {reg.billing === 'monthly' && (
              <div className="stack">
                <button className="btn success block" onClick={() => setDayEvent(day.date, null)}>● {t('regular.present')}</button>
                <button className="btn danger block" onClick={() => setDayEvent(day.date, 'leave')}>○ {t('regular.leave')}</button>
                <button className="btn ghost block" onClick={() => setDayEvent(day.date, 'half_leave')}>◐ {t('regular.half')}</button>
              </div>
            )}
          </>
        )}
      </Sheet>

      <Sheet open={sheet === 'pay'} onClose={() => setSheet(null)}>
        <h2>{t('regular.markPaid')}</h2>
        <div className="amount-display">₹{val || '0'}</div>
        <NumberPad value={val} onChange={setVal} />
        <div className="sheet-actions">
          <button className="btn primary block" onClick={() => markPaid('cash')}>💵 {t('regular.paidCash')}</button>
          <button className="btn secondary block" onClick={() => markPaid('upi')}>📱 {t('regular.paidUpi')}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'rate'} onClose={() => setSheet(null)}>
        <h2>{t('regular.changeRate')}</h2>
        <div className="amount-display">₹{val || '0'}</div>
        <NumberPad value={val} onChange={setVal} allowDecimal />
        <div className="sheet-actions">
          <button className="btn primary block" disabled={!Number(val)} onClick={async () => {
            await db.regularEvents.add({ regularId: reg.id as number, date: today, type: 'rate_change', amount: Number(val), createdAt: Date.now() })
            setSheet(null); toast(t('confirm.saved'))
          }}>{t('common.save')}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'away'} onClose={() => setSheet(null)}>
        <h2>{t('regular.away')}</h2>
        <label className="label">{t('regular.from')}<input className="field" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="label mt" style={{ display: 'block' }}>{t('regular.to')}<input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="sheet-actions">
          <button className="btn primary block" disabled={to < from} onClick={async () => {
            await db.regulars.update(reg.id as number, { pauses: [...reg.pauses, { from, to }] })
            setSheet(null); toast(t('confirm.saved'))
          }}>{t('common.save')}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'settings'} onClose={() => setSheet(null)}>
        <h2>{regularName(reg, t)}</h2>
        <label className="label">{t('regular.phone')}
          <input className="field" inputMode="tel" defaultValue={reg.phone ?? ''} onBlur={(e) => db.regulars.update(reg.id as number, { phone: e.target.value.trim() })} />
        </label>
        <div className="h2">{t('regular.vendorLang')}</div>
        <div className="row wrap">
          {LANGS.map((l) => (
            <button key={l} className={`chip tiny${(reg.vendorLang ?? settings.displayLang) === l ? ' on' : ''}`} onClick={() => db.regulars.update(reg.id as number, { vendorLang: l })}>{LANGUAGE_NAMES[l].native}</button>
          ))}
        </div>
        {reg.billing === 'monthly' && (
          <>
            <button className={`choice mt${reg.deductLeaves ? ' on' : ''}`} onClick={() => db.regulars.update(reg.id as number, { deductLeaves: !reg.deductLeaves })}>
              <span className="e">✂️</span>{t('regular.deduct')}<span className="tick">✓</span>
            </button>
            {reg.deductLeaves && (
              <label className="label mt" style={{ display: 'block' }}>{t('regular.allowed')}
                <input className="field" inputMode="numeric" defaultValue={reg.allowedLeaves} onBlur={(e) => db.regulars.update(reg.id as number, { allowedLeaves: Number(e.target.value) || 0 })} />
              </label>
            )}
          </>
        )}
        <div className="sheet-actions">
          <button className="btn danger block" onClick={async () => { if (window.confirm(t('regular.stopQ', { name: regularName(reg, t) }))) { await db.regulars.update(reg.id as number, { archived: true }); nav('/accounts') } }}>{t('regular.stop')}</button>
        </div>
      </Sheet>
    </div>
  )
}
