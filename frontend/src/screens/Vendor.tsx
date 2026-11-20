import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { appBase, decodeReply, decodeStatement, encodePayload, payloadHash, waLink, type ReplyPayload } from '../lib/statement'
import { tIn, LANGUAGE_NAMES } from '../i18n'
import { formatMonth, parseYmd } from '../lib/dates'
import { inr, num } from '../lib/money'
import { templateFor } from '../lib/categories'
import { speak } from '../lib/readback'
import type { Lang, StatementPayload } from '../lib/types'
import { LANGS } from '../lib/types'
import { Topbar } from '../components/ui'
import { regularName, weekdayLetters } from '../lib/display'

function dayCells(p: StatementPayload) {
  const codes = p.d.split(',')
  const first = parseYmd(`${p.mo}-01`).getDay()
  return { codes, first }
}

export function VendorStatement() {
  const { payload } = useParams()
  const [p, setP] = useState<StatementPayload | null>(null)
  const [hash, setHash] = useState('')
  const [err, setErr] = useState<'invalid' | 'expired' | null>(null)
  const [lang, setLang] = useState<Lang>('hi')
  const [mode, setMode] = useState<'view' | 'pick'>('view')
  const [picked, setPicked] = useState<number[]>([])
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const T = (k: string, o?: Record<string, unknown>) => tIn(lang, k, o)

  useEffect(() => {
    (async () => {
      try {
        const sp = await decodeStatement(payload ?? '')
        if (sp.exp < Date.now()) setErr('expired')
        setP(sp); setLang(sp.lg)
        const h = await payloadHash(sp)
        setHash(h)
        await db.vendorHouses.put({ sid: sp.sid, hash: h, payload: sp, status: 'new', receivedAt: Date.now() })
      } catch { setErr('invalid') }
    })()
  }, [payload])

  if (err === 'invalid') return <div className="app"><div className="page no-tabs"><div className="card empty"><div className="e">⚠️</div>{T('vendor.invalid')}</div></div></div>
  if (!p) return null
  const { codes, first } = dayCells(p)
  const service = p.rn
  const month = formatMonth(p.mo, lang)
  const unit = T(`unit.${p.u}`, { defaultValue: p.u })
  const units = codes.reduce((s, c) => s + (Number(c) || 0), 0)
  const present = codes.filter((c) => c === '1' || c === 'h').length
  const due = Math.max(0, p.t - (p.adv ?? 0))

  const reply = async (ok: boolean) => {
    const r: ReplyPayload = { v: 1, sid: p.sid, h: hash, s: ok ? 'ok' : 'dispute', dd: ok ? [] : picked.sort((a, b) => a - b), n: note.slice(0, 140) }
    const link = `${appBase()}#/r/${await encodePayload(r)}`
    const text = [ok ? T('wa.replyOk', { service, month }) : T('wa.replyBad', { service, month, days: r.dd.join(', ') }), note ? `“${note}”` : '', T('wa.replyLink', { link })]
      .filter(Boolean).join('\n')
    await db.vendorHouses.update(p.sid, { status: ok ? 'confirmed' : 'disputed' })
    window.open(waLink(undefined, text), '_blank', 'noopener')
    setSent(true)
  }
  const listen = () => void speak(`${p.ha}. ${service}, ${month}. ${T('vendor.total')} ${p.t} ${T('common.rupees')}.`, lang)

  return (
    <div className="app">
      <div className="page no-tabs">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="brand" style={{ fontSize: '1rem' }}><img src="/icon.svg" alt="" style={{ width: 32, height: 32 }} />{T('app.name')}</div>
          <select className="chip tiny" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={T('common.language')}>
            {LANGS.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l].native}</option>)}
          </select>
        </div>
        {err === 'expired' && <div className="banner warn">{T('vendor.expired')}</div>}
        <div className="card">
          <div className="label">{T('vendor.from')}</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>🏠 {p.ha}</div>
          <div className="row mt" style={{ gap: 8 }}>
            <span className="badge">{templateFor(p.tp)?.emoji} {service}</span>
            <span className="badge">📅 {month}</span>
          </div>
          <div className="mt">
            <div className="label">{T('vendor.total')}</div>
            <div className="row between"><span className="vendor-total">{inr(p.t)}</span><button className="icon-btn" onClick={listen} aria-label={T('vendor.listen')}>🔊</button></div>
            <div className="small muted">
              {p.b === 'monthly' ? T('wa.detailDays', { n: present }) : `${num(units)} ${unit} × ${inr(p.r)}`}
              {p.ded ? ` · −${inr(p.ded)}` : ''}{p.adv ? ` · ${T('accounts.paid')} ${inr(p.adv)} · ${T('accounts.due', { amount: inr(due) })}` : ''}
            </div>
          </div>
        </div>

        <div className="card mt">
          {mode === 'pick' && <div className="banner warn">{T('vendor.pick')}</div>}
          <div className="cal">
            {weekdayLetters(lang).map((d, k) => <div key={k} className="dow">{d}</div>)}
            {Array.from({ length: first }).map((_, k) => <div key={`b${k}`} />)}
            {codes.map((c, k) => {
              const dn = k + 1
              const st = c === '' ? 'future' : c === 'p' ? 'paused' : p.b === 'monthly' ? (c === 'l' ? 'leave' : c === 'h' ? 'half' : 'present')
                : Number(c) === 0 ? (p.b === 'per_unit' ? 'none' : 'skipped') : 'came'
              const on = picked.includes(dn)
              return (
                <button key={k} className={`day ${st}${on ? ' disputed today' : ''}`} disabled={mode !== 'pick' || c === ''}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== dn) : [...picked, dn])} aria-pressed={on}>
                  <span>{dn}</span><span className="mark">{st === 'skipped' || st === 'leave' ? '○' : st === 'half' ? '◐' : c && c !== '0' && p.b !== 'monthly' ? (Number(c) === 1 ? '●' : num(Number(c))) : st === 'present' ? '●' : ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        {sent ? <div className="banner ok mt">✓ {T('vendor.sent')}</div> : mode === 'view' ? (
          <div className="stack mt">
            <button className="btn success block" onClick={() => reply(true)}>{T('vendor.ok')}</button>
            <button className="btn secondary block" onClick={() => setMode('pick')}>{T('vendor.wrong')}</button>
          </div>
        ) : (
          <div className="stack mt">
            <input className="field" maxLength={140} value={note} placeholder={T('vendor.note')} onChange={(e) => setNote(e.target.value)} />
            <button className="btn primary block" disabled={!picked.length} onClick={() => reply(false)}>💬 {T('vendor.send')}</button>
          </div>
        )}
        <p className="footer-note">{T('vendor.footer')}<br />{T('landing.prototype')}</p>
        <div className="center"><Link to="/vendor" className="link-btn">{T('vendor.title')} →</Link></div>
      </div>
    </div>
  )
}

export function MyHouses() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const houses = useLiveQuery(() => db.vendorHouses.toArray(), []) ?? []
  const open = async (p: StatementPayload) => nav(`/v/${await encodePayload(p)}`)
  const totalDue = houses.reduce((s, h) => s + Math.max(0, h.payload.t - (h.payload.adv ?? 0)), 0)
  return (
    <div className="app">
      <div className="page no-tabs">
        <Topbar title={t('vendor.title')} back={() => nav('/')} />
        {houses.length === 0 ? <div className="card flat empty"><div className="e">🧾</div>{t('vendor.empty')}</div> : (
          <>
            <div className="card"><div className="label">{t('vendor.due')} · {t('vendor.houses', { n: houses.length })}</div><div className="big">{inr(totalDue)}</div></div>
            <div className="card mt">
              <ul className="list">
                {houses.sort((a, b) => b.receivedAt - a.receivedAt).map((h) => (
                  <li key={h.sid} className="item">
                    <span className="emoji-dot">{templateFor(h.payload.tp)?.emoji ?? '🏠'}</span>
                    <button className="grow" style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }} onClick={() => open(h.payload)}>
                      <div className="title">{h.payload.ha}</div>
                      <div className="sub">{h.payload.rn} · {formatMonth(h.payload.mo, i18n.language)}</div>
                    </button>
                    <span className={`badge ${h.status === 'confirmed' ? 'ok' : h.status === 'disputed' ? 'warn' : ''}`}>{inr(h.payload.t)}</span>
                    <button className="mini-btn" aria-label={t('vendor.remove')} onClick={() => db.vendorHouses.delete(h.sid)}>✕</button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function ReplyApply() {
  const { t, i18n } = useTranslation()
  const { payload } = useParams()
  const [msg, setMsg] = useState<{ text: string; ok: boolean; regularId?: number } | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const r = await decodeReply(payload ?? '')
        const st = await db.statements.get(r.sid)
        if (!st) return setMsg({ text: t('reply.notFound'), ok: false })
        if (st.hash !== r.h) return setMsg({ text: t('reply.mismatch'), ok: false })
        await db.statements.update(r.sid, { status: r.s === 'ok' ? 'confirmed' : 'disputed', disputedDays: r.dd, note: r.n || undefined, respondedAt: Date.now() })
        const reg = await db.regulars.get(st.regularId)
        const name = reg ? regularName(reg, t) : ''
        const month = formatMonth(st.month, i18n.language)
        setMsg({ text: r.s === 'ok' ? t('reply.ok', { name, month }) : t('reply.dispute', { name, days: r.dd.join(', ') }), ok: true, regularId: st.regularId })
      } catch { setMsg({ text: t('vendor.invalid'), ok: false }) }
    })()
  }, [payload, t, i18n.language])
  return (
    <div className="app"><div className="page no-tabs">
      {msg && (
        <div className="card center">
          <div style={{ fontSize: '2.6rem' }}>{msg.ok ? '✅' : '⚠️'}</div>
          <p style={{ fontWeight: 700 }}>{msg.text}</p>
          {msg.regularId ? <Link className="btn primary block" to={`/accounts/regular/${msg.regularId}`}>{t('common.continue')}</Link> : <Link className="btn ghost block" to="/today">{t('common.close')}</Link>}
        </div>
      )}
    </div></div>
  )
}

export function PasteReply() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [v, setV] = useState('')
  return (
    <div className="card mt">
      <div className="label">{t('reply.paste')}</div>
      <div className="row mt">
        <input className="field grow" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://…#/r/…" />
        <button className="btn secondary small" onClick={() => { const m = v.match(/#\/r\/([A-Za-z0-9_-]+)/); if (m) nav(`/r/${m[1]}`) }}>{t('reply.apply')}</button>
      </div>
    </div>
  )
}
