import type { Lang } from './types'

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}

async function handle<T>(r: Response): Promise<T> {
  if (r.ok) return (await r.json()) as T
  let code = 'error'
  try { code = (await r.json())?.detail?.code ?? code } catch { /* ignore */ }
  throw new ApiError(r.status, code)
}

export interface TranscribeResponse {
  text: string; duration?: number; model: string; latency_ms: number; low_confidence: boolean; avg_logprob?: number
}

export async function transcribe(blob: Blob, mime: string, lang: Lang, hints: string[]): Promise<TranscribeResponse> {
  const hint = encodeURIComponent(hints.filter(Boolean).slice(0, 40).join('|'))
  const r = await fetch(`/api/transcribe?lang=${lang}&hint=${hint}`, {
    method: 'POST', body: blob, headers: { 'Content-Type': mime || 'audio/webm' },
  })
  return handle<TranscribeResponse>(r)
}

export interface ParsedEntry {
  kind: string; amount: number | null; amount_span: string | null; qty: number | null; rate: number | null
  unit: string | null; category: string | null; member: string | null; person: string | null; account: string | null
  regular: string | null; regular_event: string | null; mode: string | null; date_offset_days: number
  occasion: string | null; note: string | null; clarify: string | null
  amount_check: string; rate_check: string; dropped_amount: number | null
}

export interface ParseResult {
  intent: 'log' | 'correction' | 'question' | 'unclear'
  entries: ParsedEntry[]
  correction: { present: boolean; target_hint: string | null; field: string | null; new_value: string | null }
  question: { present: boolean; metric: string | null; category: string | null; range: string | null }
}

export interface ParseContext {
  members: string[]; regulars: { name: string; category: string }[]; accounts: string[]; people: string[]; categories: string[]
}

export async function parse(transcript: string, lang: Lang, today: string, context: ParseContext):
  Promise<{ result: ParseResult; meta: { model?: string; latency_ms?: number } }> {
  const r = await fetch('/api/parse', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, lang, today, context }),
  })
  return handle(r)
}

const ttsCache = new Map<string, string>()

export async function ttsUrl(text: string, lang: Lang): Promise<string> {
  const key = `${lang}|${text}`
  const hit = ttsCache.get(key)
  if (hit) return hit
  const r = await fetch('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }),
  })
  if (!r.ok) throw new ApiError(r.status, 'tts')
  const url = URL.createObjectURL(await r.blob())
  ttsCache.set(key, url)
  return url
}
