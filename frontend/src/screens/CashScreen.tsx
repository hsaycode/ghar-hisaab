import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useHouse, useSettings } from '../lib/hooks'
import { cashInHand } from '../lib/ledger'
import { inr } from '../lib/money'
import { formatDay, todayStr } from '../lib/dates'
import { NumberPad, Sheet, TabBar, Topbar, toast } from '../components/ui'

export function CashScreen() {
  const { t, i18n } = useTranslation()
  const nav = useNavigate()
  const settings = useSettings()
  const house = useHouse()
  const counts = useLiveQuery(() => db.cashCounts.orderBy('date').reverse().toArray(), []) ?? []
  const [open, setOpen] = useState<null | 'count' | 'withdraw'>(null)
  const [val, setVal] = useState('')
  const [result, setResult] = useState<{ counted: number; diff: number } | null>(null)
  if (!settings) return null
  const expected = cashInHand(house.entries, settings)
  const today = todayStr()

  const doCount = async () => {
    const counted = Number(val) || 0
    await db.cashCounts.add({ date: today, counted, expected, createdAt: Date.now() })
    setResult({ counted, diff: Math.round((counted - expected) * 100) / 100 })
  }
  const reconcile = async (add: boolean) => {
    if (result && add && result.diff !== 0) {
      await db.entries.add(result.diff < 0
        ? { date: today, kind: 'expense', amount: -result.diff, category: 'other', mode: 'cash', source: 'reconcile', createdAt: Date.now() }
        : { date: today, kind: 'income', amount: result.diff, category: 'other_income', mode: 'cash', source: 'reconcile', createdAt: Date.now() })
      toast(t('confirm.saved'))
    }
    setResult(null); setOpen(null); setVal('')
  }

  return (
    <div className="app">
      <div className="page">
        <Topbar title={t('cash.title')} back={() => nav(-1)} />
        <div className="card center">
          <div className="label">{t('cash.expected')}</div>
          <div className="big" style={{ fontSize: '2.4rem' }}>{inr(expected)}</div>
        </div>
        <div className="stack mt">
          <button className="btn primary block" onClick={() => { setVal(''); setResult(null); setOpen('count') }}>🧮 {t('cash.count')}</button>
          <button className="btn secondary block" onClick={() => { setVal(''); setOpen('withdraw') }}>🏦 {t('cash.withdraw')}</button>
        </div>
        {counts.length > 0 && (
          <div className="card mt">
            <ul className="list">
              {counts.slice(0, 10).map((c) => (
                <li key={c.id} className="item">
                  <div className="grow"><div className="title">{inr(c.counted)}</div><div className="sub">{formatDay(c.date, i18n.language)} · {t('cash.expected')} {inr(c.expected)}</div></div>
                  <span className={`badge ${c.counted === c.expected ? 'ok' : 'warn'}`}>{c.counted === c.expected ? '✓' : inr(c.counted - c.expected)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <TabBar />

      <Sheet open={open === 'count'} onClose={() => setOpen(null)}>
        {!result ? (
          <>
            <h2>{t('cash.countedQ')}</h2>
            <div className="amount-display">₹{val || '0'}</div>
            <NumberPad value={val} onChange={setVal} />
            <div className="sheet-actions"><button className="btn primary block" onClick={doCount}>{t('common.continue')}</button></div>
          </>
        ) : (
          <>
            <h2>{result.diff === 0 ? t('cash.match') : result.diff < 0 ? t('cash.less', { amount: inr(-result.diff) }) : t('cash.more', { amount: inr(result.diff) })}</h2>
            <div className="sheet-actions">
              {result.diff !== 0 && <button className="btn primary block" onClick={() => reconcile(true)}>{result.diff < 0 ? t('cash.addForgot') : t('cash.addFound')}</button>}
              <button className="btn ghost block" onClick={() => reconcile(false)}>{result.diff === 0 ? t('common.done') : t('cash.leave')}</button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={open === 'withdraw'} onClose={() => setOpen(null)}>
        <h2>{t('cash.withdraw')}</h2>
        <div className="amount-display">₹{val || '0'}</div>
        <NumberPad value={val} onChange={setVal} />
        <div className="sheet-actions">
          <button className="btn primary block" disabled={!Number(val)} onClick={async () => {
            await db.entries.add({ date: today, kind: 'cash_withdrawal', amount: Number(val), mode: 'cash', source: 'typed', createdAt: Date.now() })
            setOpen(null); toast(t('confirm.saved'))
          }}>{t('common.save')}</button>
        </div>
      </Sheet>
    </div>
  )
}
