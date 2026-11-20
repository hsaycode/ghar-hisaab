import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useHouse, useSettings } from '../lib/hooks'
import { categoryChanges, monthModes, monthSummary, type ModeSplit } from '../lib/ledger'
import { inr } from '../lib/money'
import { emoji } from '../lib/categories'
import { addMonths, formatMonth, monthOf, todayStr } from '../lib/dates'
import { compactInr, shortMonth } from '../lib/display'
import { speak } from '../lib/readback'
import { TabBar, Topbar } from '../components/ui'

const MODES: { key: keyof ModeSplit; label: string; color: string }[] = [
  { key: 'cash', label: 'month.modeCash', color: 'var(--series-1)' },
  { key: 'upi', label: 'month.modeUpi', color: 'var(--series-2)' },
  { key: 'card', label: 'month.modeCard', color: 'var(--series-3)' },
]

export function Month() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const house = useHouse()
  const [ym, setYm] = useState(monthOf(todayStr()))
  const [tab, setTab] = useState<'this' | 'compare'>('this')
  const [span, setSpan] = useState<3 | 6>(3)
  const [tip, setTip] = useState<string>('')
  if (!settings) return null
  const regs = house.regulars.filter((r) => !r.archived)
  const lang = i18n.language

  const cur = monthSummary(house.entries, regs, house.events, ym)
  const prev = monthSummary(house.entries, regs, house.events, addMonths(ym, -1))
  const diff = cur.spend - prev.spend
  const max = Math.max(1, ...cur.byCategory.map((c) => c.amount))
  const closed = house.dayCloses.filter((d) => d.date.startsWith(ym)).length
  const compare = prev.spend > 0 && diff !== 0 ? (diff > 0 ? t('month.more', { amount: inr(diff) }) : t('month.less', { amount: inr(-diff) })) : ''

  // ---- compare data (oldest first) ----
  const months = Array.from({ length: span }, (_, i) => addMonths(ym, i - span + 1))
  const sums = months.map((m) => monthSummary(house.entries, regs, house.events, m))
  const modes = months.map((m) => monthModes(house.entries, m))
  const withData = sums.filter((s) => s.spend > 0).length
  const maxTotal = Math.max(1, ...sums.map((s) => s.spend))
  const maxMode = Math.max(1, ...modes.map((m) => m.cash + m.upi + m.card))
  const changes = categoryChanges(sums.slice(-3))
  const tableMonths = months.slice(-3)

  const readOut = () => {
    const top = cur.byCategory.slice(0, 3).map((c) => `${t(`cat.${c.category}`)} ${c.amount} ${t('common.rupees')}`).join(', ')
    void speak(`${t('month.total')}: ${cur.spend} ${t('common.rupees')}. ${compare}. ${top}.`, settings.displayLang)
  }

  return (
    <div className="app">
      <div className="page">
        <Topbar title={t('tabs.month')} right={<Link to="/settings" className="icon-btn" aria-label={t('settings.title')}>⚙️</Link>} />
        <div className="row" role="tablist" style={{ marginBottom: 12 }}>
          <button role="tab" aria-selected={tab === 'this'} className={`chip${tab === 'this' ? ' on' : ''}`} onClick={() => setTab('this')}>{t('month.tabThis')}</button>
          <button role="tab" aria-selected={tab === 'compare'} className={`chip${tab === 'compare' ? ' on' : ''}`} onClick={() => setTab('compare')}>📊 {t('month.tabCompare')}</button>
        </div>
        <div className="row between">
          <button className="icon-btn" onClick={() => setYm(addMonths(ym, -1))} aria-label={t('common.prevMonth')}>‹</button>
          <b>{tab === 'this' ? formatMonth(ym, lang) : `${shortMonth(months[0], lang)} – ${shortMonth(ym, lang)}`}</b>
          <button className="icon-btn" onClick={() => setYm(addMonths(ym, 1))} disabled={ym >= monthOf(todayStr())} aria-label={t('common.nextMonth')}>›</button>
        </div>

        {tab === 'this' ? (
          <>
            <div className="card mt">
              <div className="row between">
                <div>
                  <div className="label">{t('month.total')}</div>
                  <div className="big" style={{ fontSize: '2.2rem' }}>{inr(cur.spend)}</div>
                  {compare && <div className="small" style={{ fontWeight: 600 }}>{diff > 0 ? '▲' : '▼'} {compare}</div>}
                </div>
                <button className="icon-btn" onClick={readOut} aria-label={t('month.read')}>🔊</button>
              </div>
              {cur.byCategory[0] && <div className="badge accent mt">{t('month.biggest', { cat: t(`cat.${cur.byCategory[0].category}`) })}</div>}
            </div>
            {cur.byCategory.length === 0 ? (
              <div className="card flat empty mt"><div className="e">📅</div>{t('month.empty')}</div>
            ) : (
              <div className="card mt">
                {cur.byCategory.map((c) => (
                  <div key={c.category} className="bar-row">
                    <span className="emoji-dot" aria-hidden>{emoji(c.category)}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{t(`cat.${c.category}`)}</div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.amount / max) * 100}%` }} /></div>
                    </div>
                    <span className="amount">{inr(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="card mt">
              <div className="row between item"><span>🏦 {t('month.income')}</span><span className="amount">{inr(cur.income)}</span></div>
              <div className="row between item"><span>🥛 {t('month.regular')}</span><span className="amount">{inr(cur.regularTotal)}</span></div>
              <div className="row between item"><span>🎁 {t('month.gifts')}</span><span className="amount">{inr(cur.giftsGiven)}</span></div>
              <div className="row between item"><span>✓ {t('month.closed', { n: closed })}</span><span /></div>
            </div>
          </>
        ) : withData < 2 ? (
          <div className="card flat empty mt"><div className="e">📊</div>{t('month.noData')}</div>
        ) : (
          <>
            <div className="row mt" style={{ gap: 8 }}>
              {([3, 6] as const).map((n) => (
                <button key={n} className={`chip tiny${span === n ? ' on' : ''}`} onClick={() => setSpan(n)}>{t('month.period', { n })}</button>
              ))}
            </div>

            <div className="card mt">
              <div style={{ fontWeight: 700 }}>{t('month.totals')}</div>
              <p className="tip" aria-live="polite">{tip || `${shortMonth(ym, lang)}: ${inr(sums[sums.length - 1].spend)}`}</p>
              <div className="vbars" role="list">
                {sums.map((s) => {
                  const label = `${shortMonth(s.ym, lang)}: ${inr(s.spend)}`
                  return (
                    <button key={s.ym} role="listitem" className="vbar" aria-label={label}
                      onMouseEnter={() => setTip(label)} onFocus={() => setTip(label)} onClick={() => setTip(label)}>
                      <small>{compactInr(s.spend, lang)}</small>
                      <i style={{ height: `${Math.max(2, (s.spend / maxTotal) * 120)}px` }} />
                    </button>
                  )
                })}
              </div>
              <div className="vbar-labels">{sums.map((s) => <span key={s.ym}>{shortMonth(s.ym, lang)}</span>)}</div>
            </div>

            <div className="card mt">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('month.byCategory')}</div>
              <table className="metrics">
                <thead>
                  <tr><th>{t('month.category')}</th>{tableMonths.map((m) => <th key={m} style={{ textAlign: 'right' }}>{shortMonth(m, lang)}</th>)}<th style={{ textAlign: 'right' }}>{t('month.vsPrev')}</th></tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.category}>
                      <td>{emoji(c.category)} {t(`cat.${c.category}`)}</td>
                      {c.values.map((v, k) => <td key={k} style={{ textAlign: 'right' }} className="amount">{v ? inr(v) : '·'}</td>)}
                      <td style={{ textAlign: 'right' }}>
                        {c.delta == null || c.delta === 0 ? '·'
                          : c.values[c.values.length - 2] === 0 ? <span className="badge">{t('month.newCat')}</span>
                            : <span className={c.delta > 0 ? 'delta-up' : 'delta-down'}>{c.delta > 0 ? '▲' : '▼'} {inr(Math.abs(c.delta))}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card mt">
              <div style={{ fontWeight: 700 }}>{t('month.byMode')}</div>
              <div className="legend-row" aria-hidden>
                {MODES.map((m) => <span key={m.key}><i className="swatch" style={{ background: m.color }} />{t(m.label)}</span>)}
              </div>
              {modes.map((md, k) => (
                <div key={months[k]} className="stack-row">
                  <span className="small muted" style={{ fontWeight: 700 }}>{shortMonth(months[k], lang)}</span>
                  <div className="mode-stack" style={{ width: `${Math.max(4, ((md.cash + md.upi + md.card) / maxMode) * 100)}%` }}>
                    {MODES.map((m) => md[m.key] > 0 && (
                      <button key={m.key} style={{ background: m.color, flexGrow: md[m.key] }}
                        aria-label={`${shortMonth(months[k], lang)} ${t(m.label)}: ${inr(md[m.key])}`}
                        onMouseEnter={() => setTip(`${shortMonth(months[k], lang)} · ${t(m.label)}: ${inr(md[m.key])}`)}
                        onClick={() => setTip(`${shortMonth(months[k], lang)} · ${t(m.label)}: ${inr(md[m.key])}`)} />
                    ))}
                  </div>
                </div>
              ))}
              <table className="metrics mt">
                <thead><tr><th />{MODES.map((m) => <th key={m.key} style={{ textAlign: 'right' }}><i className="swatch" style={{ background: m.color }} />{t(m.label)}</th>)}</tr></thead>
                <tbody>
                  {modes.map((md, k) => (
                    <tr key={months[k]}><td>{shortMonth(months[k], lang)}</td>{MODES.map((m) => <td key={m.key} style={{ textAlign: 'right' }} className="amount">{inr(md[m.key])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <TabBar />
    </div>
  )
}
