import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { useHouse, useSettings } from '../lib/hooks'
import { monthBill, paidFor } from '../lib/billing'
import { cashInHand, khataBalance, personSummary } from '../lib/ledger'
import { inr } from '../lib/money'
import { REGULAR_TEMPLATES, templateFor } from '../lib/categories'
import { monthOf, todayStr } from '../lib/dates'
import { nameKey } from '../lib/names'
import { Sheet, TabBar, Topbar } from '../components/ui'
import { PasteReply } from './Vendor'
import { regularName } from '../lib/display'

export function Accounts() {
  const { t } = useTranslation()
  const settings = useSettings()
  const house = useHouse()
  const [addReg, setAddReg] = useState(false)
  const [addName, setAddName] = useState<null | 'accounts' | 'people'>(null)
  const [name, setName] = useState('')
  const [tpl, setTpl] = useState('milk')
  const [rate, setRate] = useState('')
  if (!settings) return null
  const today = todayStr()
  const ym = monthOf(today)
  const regs = house.regulars.filter((r) => !r.archived)
  const accounts = house.accounts.filter((a) => !a.archived)
  const people = house.people.filter((p) => !p.archived)

  const saveRegular = async () => {
    const tp = REGULAR_TEMPLATES.find((x) => x.id === tpl)!
    const nm = name.trim() || t(`tpl.${tpl}`)
    await db.regulars.add({ name: nm, nameKey: nameKey(nm), autoName: !name.trim(), template: tp.id, category: tp.category, billing: tp.billing,
      rate: Number(rate) || tp.rate, unit: tp.unit, defaultQty: tp.defaultQty || 1, deductLeaves: false, allowedLeaves: 2,
      vendorLang: settings.displayLang, startDate: today, pauses: [], createdAt: Date.now() })
    setAddReg(false); setName(''); setRate('')
  }
  const saveNamed = async () => {
    if (!addName || !name.trim()) return
    await db[addName].add({ name: name.trim(), nameKey: nameKey(name), createdAt: Date.now() })
    setAddName(null); setName('')
  }

  return (
    <div className="app">
      <div className="page">
        <Topbar title={t('tabs.accounts')} right={<Link to="/settings" className="icon-btn" aria-label={t('settings.title')}>⚙️</Link>} />

        <Link to="/accounts/cash" className="card card-link row">
          <span className="emoji-dot" aria-hidden>💵</span>
          <div className="grow"><div className="label">{t('accounts.cash')}</div><div className="big">{inr(cashInHand(house.entries, settings))}</div></div>
          <span aria-hidden>›</span>
        </Link>

        <div className="h2 row between"><span>{t('accounts.regulars')}</span><button className="chip tiny" onClick={() => setAddReg(true)}>+ {t('accounts.addRegular')}</button></div>
        <div className="card">
          {regs.length === 0 ? <div className="empty small">{t('accounts.none')}</div> : (
            <ul className="list">
              {regs.map((r) => {
                const bill = monthBill(r, house.events, ym, today)
                const paid = paidFor(house.entries, r.id as number, ym)
                const st = house.statements.filter((s) => s.regularId === r.id && s.month === ym).sort((a, b) => b.sentAt - a.sentAt)[0]
                return (
                  <li key={r.id}>
                    <Link to={`/accounts/regular/${r.id}`} className="item" style={{ textDecoration: 'none' }}>
                      <span className="emoji-dot" aria-hidden>{templateFor(r.template)?.emoji ?? '🔁'}</span>
                      <div className="grow">
                        <div className="title">{regularName(r, t)}</div>
                        <div className="sub">{t('accounts.thisMonth')}: {inr(bill.total)}{paid ? ` · ${t('regular.paidAmount', { amount: inr(paid) })}` : ''}</div>
                      </div>
                      {st && <span className={`badge ${st.status === 'confirmed' || st.status === 'paid' ? 'ok' : st.status === 'disputed' ? 'warn' : ''}`}>{t(`regular.status_${st.status}`)}</span>}
                      <span aria-hidden>›</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {house.statements.some((s) => s.status === 'sent') && <PasteReply />}

        <div className="h2 row between"><span>{t('accounts.khata')}</span><button className="chip tiny" onClick={() => setAddName('accounts')}>+ {t('accounts.addShop')}</button></div>
        <div className="card">
          {accounts.length === 0 ? <div className="empty small">{t('accounts.none')}</div> : (
            <ul className="list">
              {accounts.map((a) => {
                const bal = khataBalance(house.entries, a.id as number)
                return (
                  <li key={a.id}>
                    <Link to={`/accounts/khata/${a.id}`} className="item" style={{ textDecoration: 'none' }}>
                      <span className="emoji-dot" aria-hidden>🛒</span>
                      <div className="grow"><div className="title">{a.name}</div>
                        <div className="sub">{bal > 0 ? t('accounts.owe', { amount: inr(bal) }) : t('accounts.settled')}</div></div>
                      <span className="amount">{inr(bal)}</span><span aria-hidden>›</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="h2 row between"><span>{t('accounts.lena')}</span><button className="chip tiny" onClick={() => setAddName('people')}>+ {t('accounts.addPerson')}</button></div>
        <div className="card">
          {people.length === 0 ? <div className="empty small">{t('accounts.none')}</div> : (
            <ul className="list">
              {people.map((p) => {
                const s = personSummary(house.entries, p.id as number)
                return (
                  <li key={p.id}>
                    <Link to={`/accounts/person/${p.id}`} className="item" style={{ textDecoration: 'none' }}>
                      <span className="emoji-dot" aria-hidden>{s.owesUs ? '🤝' : '🎁'}</span>
                      <div className="grow"><div className="title">{p.name}</div>
                        <div className="sub">
                          {s.owesUs > 0 ? t('accounts.owesUs', { amount: inr(s.owesUs) }) : s.owesUs < 0 ? t('accounts.weOwe', { amount: inr(-s.owesUs) }) : t('accounts.settled')}
                          {s.giftsGiven ? ` · ${t('accounts.gifts', { amount: inr(s.giftsGiven) })}` : ''}
                        </div></div>
                      <span aria-hidden>›</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      <TabBar />

      <Sheet open={addReg} onClose={() => setAddReg(false)}>
        <h2>{t('accounts.addRegular')}</h2>
        <div className="tiles">
          {REGULAR_TEMPLATES.map((x) => (
            <button key={x.id} className={`tile${tpl === x.id ? ' on' : ''}`} onClick={() => { setTpl(x.id); setRate(String(x.rate)) }}>
              <span className="e">{x.emoji}</span>{t(`tpl.${x.id}`)}
            </button>
          ))}
        </div>
        <input className="field mt" value={name} placeholder={t('onb.regulars.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        <input className="field mt" inputMode="numeric" value={rate} placeholder={t('onb.regulars.rate')} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
        <div className="sheet-actions"><button className="btn primary block" onClick={saveRegular}>{t('common.save')}</button></div>
      </Sheet>

      <Sheet open={!!addName} onClose={() => setAddName(null)}>
        <h2>{addName === 'accounts' ? t('accounts.addShop') : t('accounts.addPerson')}</h2>
        <input className="field" autoFocus value={name} placeholder={addName === 'accounts' ? t('onb.khata.placeholder') : t('onb.members.placeholder')} onChange={(e) => setName(e.target.value)} />
        <div className="sheet-actions"><button className="btn primary block" onClick={saveNamed} disabled={!name.trim()}>{t('common.save')}</button></div>
      </Sheet>
    </div>
  )
}
