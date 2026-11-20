import { useTranslation } from 'react-i18next'
import type { Draft } from '../lib/drafts'
import { missing } from '../lib/drafts'
import type { Member, Regular } from '../lib/types'
import { emoji, templateFor } from '../lib/categories'
import { draftLabel } from '../lib/readback'
import { inr } from '../lib/money'
import { dayOffsetLabel, modeLabel, regularName } from '../lib/display'

interface Props {
  draft: Draft
  index: number
  members: Member[]
  regulars: Regular[]
  onEdit: () => void
  onRemove: () => void
  onRerecord?: () => void
  onPatch: (p: Partial<Draft>) => void
}

export function DraftCard({ draft: d, index, members, regulars, onEdit, onRemove, onRerecord, onPatch }: Props) {
  const { t } = useTranslation()
  const need = missing(d)
  const reg = regulars.find((r) => r.id === d.regularId)
  const icon = d.kind === 'regular_event' || d.kind === 'regular_payment'
    ? (reg ? templateFor(reg.template)?.emoji ?? '🔁' : '🔁')
    : d.kind === 'expense' || d.kind === 'income' || d.kind === 'credit_purchase' ? emoji(d.category)
      : d.kind.startsWith('gift') ? '🎁' : d.kind.startsWith('loan') ? '🤝' : d.kind.startsWith('cash') ? '🏦' : '🧾'
  const who = d.memberId ? members.find((m) => m.id === d.memberId)?.name : null
  const isGiftOrLoan = d.kind === 'gift_given' || d.kind === 'loan_given'
  const unverified = d.amountCheck === 'unverified'

  return (
    <div className={`draft${need ? ' needs' : ''}`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="draft-main">
        <span className="emoji-dot" aria-hidden>{icon}</span>
        <div className="grow">
          <div className="title" style={{ fontWeight: 700 }}>{draftLabel(d, t, regulars)}</div>
          <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
            {who && <span className="badge">👤 {who}</span>}
            {d.mode !== 'cash' && d.kind !== 'regular_event' && <span className="badge">{d.mode === 'upi' ? '📱' : '💳'} {modeLabel(d.mode, t)}</span>}
            {d.dateOffset < 0 && <span className="badge">📅 {dayOffsetLabel(d.dateOffset, t)}</span>}
            {d.accountName && d.kind === 'credit_payment' && <span className="badge">🛒 {d.accountName}</span>}
          </div>
        </div>
        {d.kind !== 'regular_event' && (
          d.amount != null
            ? <span className="draft-amount">{inr(d.amount)}</span>
            : <button className="chip warn" onClick={onEdit}>{t('confirm.ask')}</button>
        )}
      </div>

      {(d.alt != null || unverified) && d.amount != null && (
        <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
          <span className="badge warn">⚠ {t('confirm.check')}</span>
          {d.alt != null && (
            <button className="chip tiny warn" onClick={() => onPatch({ amount: d.alt as number, alt: d.amount ?? undefined })}>
              {t('confirm.orAlt', { alt: d.alt })}
            </button>
          )}
        </div>
      )}
      {need === 'regular' && (
        <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
          <span className="badge warn">{t('confirm.which')}</span>
          {regulars.filter((r) => !r.archived).map((r) => (
            <button key={r.id} className="chip tiny" onClick={() => onPatch({ regularId: r.id ?? null })}>{regularName(r, t)}</button>
          ))}
        </div>
      )}
      {isGiftOrLoan && (
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button className={`chip tiny${d.kind === 'gift_given' ? ' on' : ''}`} onClick={() => onPatch({ kind: 'gift_given' })}>🎁 {t('confirm.gift')}</button>
          <button className={`chip tiny${d.kind === 'loan_given' ? ' on' : ''}`} onClick={() => onPatch({ kind: 'loan_given' })}>🤝 {t('confirm.loan')}</button>
        </div>
      )}
      <div className="draft-actions">
        <button className="mini-btn" onClick={onEdit}>✎ {t('common.edit')}</button>
        {onRerecord && <button className="mini-btn" onClick={onRerecord} aria-label={t('common.sayAgain')}>🔁 🎤</button>}
        <button className="mini-btn" onClick={onRemove}>✕ {t('confirm.remove')}</button>
      </div>
    </div>
  )
}
