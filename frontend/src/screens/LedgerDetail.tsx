import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/db'
import { useHouse, useSettings } from '../lib/hooks'
import { khataBalance, personSummary } from '../lib/ledger'
import { inr } from '../lib/money'
import { formatDay, todayStr } from '../lib/dates'
import { blankDraft, commitDrafts, type Draft, type DraftKind } from '../lib/drafts'
import { TabBar, Topbar, toast } from '../components/ui'
import { EditDraftSheet } from '../components/EditDraftSheet'

export function LedgerDetail({ type }: { type: 'khata' | 'person' }) {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const nav = useNavigate()
  const settings = useSettings()
  const house = useHouse()
  const [draft, setDraft] = useState<Draft | null>(null)
  if (!settings) return null
  const item = (type === 'khata' ? house.accounts : house.people).find((x) => String(x.id) === id)
  if (!item) return null
  const rows = house.entries
    .filter((e) => (type === 'khata' ? e.accountId === item.id : e.personId === item.id))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  const start = (kind: DraftKind) => setDraft({ ...blankDraft(kind), category: kind === 'credit_purchase' ? 'kirana' : null,
    accountName: type === 'khata' ? item.name : null, personName: type === 'person' ? item.name : null })

  const summary = type === 'khata'
    ? (() => { const b = khataBalance(house.entries, item.id as number); return b > 0 ? t('accounts.owe', { amount: inr(b) }) : t('accounts.settled') })()
    : (() => {
      const s = personSummary(house.entries, item.id as number)
      return [s.owesUs > 0 ? t('accounts.owesUs', { amount: inr(s.owesUs) }) : s.owesUs < 0 ? t('accounts.weOwe', { amount: inr(-s.owesUs) }) : t('accounts.settled'),
        s.giftsGiven ? t('accounts.gifts', { amount: inr(s.giftsGiven) }) : ''].filter(Boolean).join(' · ')
    })()

  const actions: DraftKind[] = type === 'khata' ? ['credit_purchase', 'credit_payment'] : ['loan_given', 'loan_repaid_to_us', 'gift_given', 'gift_received']

  return (
    <div className="app">
      <div className="page">
        <Topbar title={item.name} back={() => nav('/accounts')} />
        <div className="card"><div className="label">{type === 'khata' ? t('accounts.khata') : t('accounts.lena')}</div><div className="big">{summary}</div></div>
        <div className="row wrap mt">
          {actions.map((k) => <button key={k} className="btn secondary small" onClick={() => start(k)}>+ {t(`kind.${k}`)}</button>)}
        </div>
        <div className="card mt">
          {rows.length === 0 ? <div className="empty small">{t('accounts.none')}</div> : (
            <ul className="list">
              {rows.map((e) => (
                <li key={e.id} className="item">
                  <div className="grow">
                    <div className="title">{t(`kind.${e.kind}`)}{e.occasion ? ` · ${e.occasion}` : ''}</div>
                    <div className="sub">{formatDay(e.date, i18n.language)}{e.note ? ` · ${e.note}` : ''}</div>
                  </div>
                  <span className="amount">{inr(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="link-btn mt" onClick={async () => {
          if (!window.confirm(t('accounts.removeQ', { name: item.name }))) return
          await (type === 'khata' ? db.accounts : db.people).update(item.id as number, { archived: true })
          nav('/accounts')
        }}>{t('accounts.remove')}</button>
      </div>
      <TabBar />
      <EditDraftSheet open={!!draft} draft={draft} members={house.members} regulars={house.regulars} settings={settings}
        onClose={() => setDraft(null)}
        onSave={async (d) => { await commitDrafts([d], todayStr(), 'typed'); setDraft(null); toast(t('confirm.saved')) }} />
    </div>
  )
}
