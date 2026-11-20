// Fallback: the phone's own speech recognition (Chrome Web Speech API) when the AI speech
// service is busy (free-tier quota). It listens live, so the user speaks once more.
import type { Lang } from './types'

const BCP47: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', te: 'te-IN', ta: 'ta-IN' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any

export function deviceAsrSupported(): boolean {
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function listenOnce(lang: Lang, onInterim?: (t: string) => void): { promise: Promise<string>; stop: () => void } {
  const w = window as unknown as Record<string, AnyRec>
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  const rec: AnyRec = new Ctor()
  rec.lang = BCP47[lang]
  rec.interimResults = true
  rec.continuous = true
  rec.maxAlternatives = 1
  let finalText = ''
  let silenceTimer: number | undefined
  const promise = new Promise<string>((resolve, reject) => {
    rec.onresult = (ev: AnyRec) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finalText += r[0].transcript + ' '
        else interim += r[0].transcript
      }
      onInterim?.((finalText + interim).trim())
      if (silenceTimer) window.clearTimeout(silenceTimer)
      silenceTimer = window.setTimeout(() => rec.stop(), 4000)
    }
    rec.onerror = (ev: AnyRec) => reject(new Error(ev.error || 'speech_error'))
    rec.onend = () => resolve(finalText.trim())
  })
  rec.start()
  return { promise, stop: () => rec.stop() }
}
