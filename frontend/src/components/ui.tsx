import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        {children}
      </div>
    </>
  )
}

export function TabBar() {
  const { t } = useTranslation()
  const tabs = [
    { to: '/today', ico: '📒', label: t('tabs.today') },
    { to: '/accounts', ico: '🗂️', label: t('tabs.accounts') },
    { to: '/month', ico: '📅', label: t('tabs.month') },
  ]
  return (
    <nav className="tabbar" aria-label={t('common.mainNav')}>
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <span className="ico" aria-hidden>{x.ico}</span>
          <span>{x.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function NumberPad({ value, onChange, allowDecimal = false }: { value: string; onChange: (v: string) => void; allowDecimal?: boolean }) {
  const { t } = useTranslation()
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1))
    if (k === '.' && (!allowDecimal || value.includes('.'))) return
    if (value.replace('.', '').length >= 8) return
    onChange(value === '0' && k !== '.' ? k : value + k)
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : '00', '0', '⌫']
  return (
    <div className="numpad">
      {keys.map((k) => (
        <button key={k} type="button" onClick={() => press(k === '00' ? '00' : k)} aria-label={k === '⌫' ? t('common.backspace') : k}>{k}</button>
      ))}
    </div>
  )
}

// ---- toast ----------------------------------------------------------------------------------
type Listener = (msg: string) => void
const listeners = new Set<Listener>()
export function toast(msg: string) { listeners.forEach((l) => l(msg)) }

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let timer: number | undefined
    const l: Listener = (m) => { setMsg(m); window.clearTimeout(timer); timer = window.setTimeout(() => setMsg(null), 2600) }
    listeners.add(l)
    return () => { listeners.delete(l); window.clearTimeout(timer) }
  }, [])
  return msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null
}

export function Topbar({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="topbar">
      {back ? <button className="icon-btn" onClick={back} aria-label={t('common.back')}>←</button> : null}
      <h1 className="grow">{title}</h1>
      {right}
    </div>
  )
}
