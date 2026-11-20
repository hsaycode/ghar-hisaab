import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Draft, DraftKind } from '../lib/drafts'
import type { Member, Regular, RegularEventType, Settings } from '../lib/types'
import { emoji, expenseCategories, incomeCategories } from '../lib/categories'
import { NumberPad, Sheet } from './ui'
import { regularName } from '../lib/display'

const MAIN_KINDS: DraftKind[] = ['expense', 'income', 'credit_purchase', 'credit_payment', 'loan_given', 'loan_repaid_to_us',
  'gift_given', 'cash_withdrawal', 'regular_event']
const EVENT_TYPES: RegularEventType[] = ['skip', 'extra', 'less', 'units', 'leave', 'half_leave', 'advance', 'rate_change']

interface Props {
  open: boolean
  draft: Draft | null
  members: Member[]
  regulars: Regular[]
  settings: Settings
  title?: string
  onSave: (d: Draft) => void
  onClose: () => void
}

export function EditDraftSheet({ open, draft, members, regulars, settings, title, onSave, onClose }: Props) {
  const { t } = useTranslation()
  const [d, setD] = useState<Draft | null>(draft)
  const [amountStr, setAmountStr] = useState('')
  useEffect(() => {
    setD(draft)
    const v = draft?.kind === 'regular_event'
      ? (draft.regularEvent === 'rate_change' ? draft.rate : draft.regularEvent === 'advance' ? draft.amount : draft.qty)
      : draft?.amount
    setAmountStr(v != null ? String(v) : '')
  }, [draft])
  if (!d) return null

  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch })
  const isEvent = d.kind === 'regular_event'
  const evt = d.regularEvent
  const needsQty = isEvent && (evt === 'extra' || evt === 'less' || evt === 'units')
  const needsMoney = !isEvent || evt === 'advance' || evt === 'rate_change'
  const showPad = !isEvent || needsQty || needsMoney && (evt === 'advance' || evt === 'rate_change')
  const liveRegs = regulars.filter((r) => !r.archived)
  const cats = d.kind === 'income' ? incomeCategories(settings.usage)
    : (d.kind === 'expense' || d.kind === 'credit_purchase') ? expenseCategories(settings.displayLang, settings.usage) : []
  const needsAccount = d.kind === 'credit_purchase' || d.kind === 'credit_payment'
  const needsPerson = /loan|gift/.test(d.kind)
  const needsRegular = isEvent || d.kind === 'regular_payment'

  const save = () => {
    const n = amountStr ? Number(amountStr) : null
    const out: Draft = { ...d }
    if (isEvent) {
      if (evt === 'rate_change') out.rate = n
      else if (evt === 'advance') out.amount = n
      else if (needsQty) out.qty = n
    } else {
      out.amount = n
      out.alt = undefined
      out.amountCheck = 'derived'
    }
    onSave(out)
  }

  return (
    <Sheet open={open} onClose={onClose} label={title ?? t('type.title')}>
      <h2>{title ?? t('type.title')}</h2>
      <div className="row wrap" role="radiogroup" aria-label={t('type.title')}>
        {MAIN_KINDS.map((k) => (
          <button key={k} className={`chip${d.kind === k ? ' on' : ''}`} role="radio" aria-checked={d.kind === k}
            onClick={() => set({ kind: k, regularEvent: k === 'regular_event' ? (evt ?? 'skip') : null,
              category: k === 'income' ? 'other_income' : k === 'expense' ? (d.category && !incomeCategories(settings.usage).includes(d.category) ? d.category : 'other') : k === 'credit_purchase' ? 'kirana' : null })}>
            {k === 'regular_event' ? `🥛 ${t('accounts.regulars')}` : t(`kind.${k}`)}
          </button>
        ))}
      </div>

      {needsRegular && (
        <>
          <div className="h2">{t('confirm.which')}</div>
          <div className="row wrap">
            {liveRegs.map((r) => (
              <button key={r.id} className={`chip${d.regularId === r.id ? ' on' : ''}`} onClick={() => set({ regularId: r.id ?? null })}>{regularName(r, t)}</button>
            ))}
          </div>
        </>
      )}
      {isEvent && (
        <div className="row wrap mt">
          {EVENT_TYPES.map((e) => (
            <button key={e} className={`chip tiny${evt === e ? ' on' : ''}`} onClick={() => set({ regularEvent: e })}>
              {t(`regev.${e}`, { qty: '', amount: '', rate: '' })}
            </button>
          ))}
        </div>
      )}

      {showPad && (
        <>
          <div className="amount-display" aria-live="polite">{needsQty ? (amountStr || '0') : `₹${amountStr || '0'}`}</div>
          <NumberPad value={amountStr} onChange={setAmountStr} allowDecimal={needsQty} />
        </>
      )}

      {cats.length > 0 && (
        <>
          <div className="h2">{t('type.what')}</div>
          <div className="tiles">
            {cats.map((c) => (
              <button key={c} className={`tile${d.category === c ? ' on' : ''}`} onClick={() => set({ category: c })}>
                <span className="e" aria-hidden>{emoji(c)}</span>{t(`cat.${c}`)}
              </button>
            ))}
          </div>
        </>
      )}

      {(needsAccount || needsPerson) && (
        <>
          <div className="h2">{needsAccount ? t('accounts.khata') : t('accounts.lena')}</div>
          <input className="field" value={(needsAccount ? d.accountName : d.personName) ?? ''}
            placeholder={needsAccount ? t('onb.khata.placeholder') : t('onb.members.placeholder')}
            onChange={(e) => set(needsAccount ? { accountName: e.target.value } : { personName: e.target.value })} />
        </>
      )}

      {!isEvent && members.length > 0 && (
        <>
          <div className="h2">{t('type.who')}</div>
          <div className="row wrap">
            <button className={`chip${d.memberId == null ? ' on' : ''}`} onClick={() => set({ memberId: null })}>{t('confirm.household')}</button>
            {members.filter((m) => !m.archived).map((m) => (
              <button key={m.id} className={`chip${d.memberId === m.id ? ' on' : ''}`} onClick={() => set({ memberId: m.id ?? null })}>{m.name}</button>
            ))}
          </div>
        </>
      )}

      {!isEvent && d.kind !== 'credit_purchase' && d.kind !== 'cash_withdrawal' && (
        <>
          <div className="h2">{t('type.mode')}</div>
          <div className="row">
            <button className={`chip${d.mode === 'cash' ? ' on' : ''}`} onClick={() => set({ mode: 'cash' })}>💵 {t('type.cash')}</button>
            <button className={`chip${d.mode === 'upi' ? ' on' : ''}`} onClick={() => set({ mode: 'upi' })}>📱 {t('type.upi')}</button>
            <button className={`chip${d.mode === 'card' || d.mode === 'bank' ? ' on' : ''}`} onClick={() => set({ mode: 'card' })}>💳 {t('month.modeCard')}</button>
          </div>
        </>
      )}

      <div className="sheet-actions">
        <button className="btn primary block" onClick={save}>{t('common.save')}</button>
        <button className="btn ghost block" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </Sheet>
  )
}
