// Spoken confirmation of what was understood. Neural TTS from the server (works for all 6
// languages); browser speechSynthesis only as a fallback when a matching voice exists.
import type { TFunction } from 'i18next'
import type { Draft } from './drafts'
import type { Lang, Member, Regular } from './types'
import { ttsUrl } from './api'
import { regularName } from './display'

let current: HTMLAudioElement | null = null

export function stopSpeaking() {
  current?.pause()
  current = null
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
}

export function draftLabel(d: Draft, t: TFunction, regulars: Regular[]): string {
  if (d.kind === 'regular_event') {
    const reg = regulars.find((r) => r.id === d.regularId)
    const name = reg ? regularName(reg, t) : t('confirm.which')
    return `${name}: ${t(`regev.${d.regularEvent ?? 'skip'}`, { qty: d.qty ?? '', amount: d.amount ?? '', rate: d.rate ?? '' })}`
  }
  if (d.kind === 'regular_payment') {
    const reg = regulars.find((r) => r.id === d.regularId)
    return `${reg ? regularName(reg, t) : t('confirm.which')}: ${t('kind.regular_payment')}`
  }
  if (d.kind === 'expense' || d.kind === 'income' || d.kind === 'credit_purchase') {
    const cat = d.category ? t(`cat.${d.category}`) : t(`kind.${d.kind}`)
    const who = d.accountName && d.kind === 'credit_purchase' ? ` (${d.accountName})` : ''
    return d.note && d.category === 'other' ? `${d.note}${who}` : `${cat}${who}`
  }
  const who = d.personName || d.accountName
  return who ? `${t(`kind.${d.kind}`)}: ${who}` : t(`kind.${d.kind}`)
}

export function readbackText(drafts: Draft[], t: TFunction, regulars: Regular[], members: Member[]): string {
  const parts = drafts.map((d) => {
    const label = draftLabel(d, t, regulars)
    const who = d.memberId ? members.find((m) => m.id === d.memberId)?.name : null
    const amount = d.kind === 'regular_event'
      ? ''
      : d.amount != null ? t('readback.amount', { amount: d.amount }) : t('readback.noAmount')
    const mode = d.kind !== 'regular_event' && d.mode !== 'cash' ? (d.mode === 'upi' ? 'UPI' : t('month.modeCard')) : ''
    return [label, who ? `(${who})` : '', amount, mode].filter(Boolean).join(' ')
  })
  const total = drafts.reduce((s, d) => s + (d.kind !== 'regular_event' && d.amount ? d.amount : 0), 0)
  const head = drafts.length > 5 ? `${t('readback.summary', { count: drafts.length, total })} ` : ''
  return `${head}${parts.join(', ')}. ${t('readback.ok')}`
}

const BCP47: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', te: 'te-IN', ta: 'ta-IN' }

function browserSpeak(text: string, lang: Lang): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(BCP47[lang].toLowerCase().slice(0, 2)))
  if (!voice && lang !== 'en') return false
  const u = new SpeechSynthesisUtterance(text)
  u.lang = BCP47[lang]
  if (voice) u.voice = voice
  u.rate = 0.92
  synth.speak(u)
  return true
}

export async function speak(text: string, lang: Lang): Promise<void> {
  stopSpeaking()
  try {
    const url = await ttsUrl(text, lang)
    const audio = new Audio(url)
    current = audio
    await audio.play()
  } catch {
    browserSpeak(text, lang)
  }
}
