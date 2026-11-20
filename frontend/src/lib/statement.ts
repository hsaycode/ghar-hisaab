// Vendor statement links: compact, compressed, hash-bound. No server storage.
import { z } from 'zod'
import type { Lang, Regular, StatementPayload } from './types'
import type { Bill } from './billing'

const MAX_COMPRESSED = 8 * 1024
const MAX_JSON = 64 * 1024

const PayloadSchema = z.object({
  v: z.literal(1),
  sid: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/),
  ha: z.string().max(40),
  rn: z.string().max(40),
  tp: z.string().max(20),
  mo: z.string().regex(/^\d{4}-\d{2}$/),
  b: z.enum(['daily_qty', 'per_unit', 'monthly']),
  u: z.string().max(12),
  r: z.number().nonnegative().max(1_000_000),
  d: z.string().max(400),
  t: z.number().nonnegative().max(10_000_000),
  lg: z.enum(['en', 'hi', 'mr', 'bn', 'te', 'ta']),
  exp: z.number(),
  ded: z.number().optional(),
  adv: z.number().optional(),
})

const ReplySchema = z.object({
  v: z.literal(1),
  sid: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/),
  h: z.string().regex(/^[0-9a-f]{16}$/),
  s: z.enum(['ok', 'dispute']),
  dd: z.array(z.number().int().min(1).max(31)).max(31),
  n: z.string().max(140),
})
export type ReplyPayload = z.infer<typeof ReplySchema>

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function deflate(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text)
  if (typeof CompressionStream === 'undefined') return data
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') return new TextDecoder().decode(bytes)
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_JSON) throw new Error('too_large')
      chunks.push(value)
    }
    const out = new Uint8Array(size)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.length }
    return new TextDecoder().decode(out)
  } catch (e) {
    if ((e as Error).message === 'too_large') throw e
    return new TextDecoder().decode(bytes) // uncompressed fallback
  }
}

function canonical(obj: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(obj).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = obj[k]; return acc }, {}))
}

export async function payloadHash(p: StatementPayload): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(p as unknown as Record<string, unknown>))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export function newSid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return b64urlEncode(bytes)
}

export function buildPayload(reg: Regular, bill: Bill, houseAlias: string, lang: Lang, sid: string, paid = 0,
  serviceName = reg.name): StatementPayload {
  const codes = bill.days.map((d) => {
    if (d.status === 'before' || d.status === 'future') return ''
    if (d.status === 'paused') return 'p'
    if (reg.billing === 'monthly') return d.status === 'leave' ? 'l' : d.status === 'half' ? 'h' : '1'
    return String(d.qty === 0 ? 0 : Number(d.qty.toFixed(2)))
  })
  return {
    v: 1, sid, ha: houseAlias.slice(0, 40) || 'Ghar', rn: serviceName.slice(0, 40), tp: reg.template, mo: bill.ym,
    b: reg.billing, u: reg.unit.slice(0, 12), r: bill.rateNow, d: codes.join(','), t: bill.total, lg: lang,
    exp: Date.now() + 60 * 24 * 3600 * 1000,
    ...(bill.deduction ? { ded: bill.deduction } : {}),
    ...(paid ? { adv: paid } : {}),
  }
}

export async function encodePayload(obj: object): Promise<string> {
  return b64urlEncode(await deflate(JSON.stringify(obj)))
}

async function decodeRaw(s: string): Promise<unknown> {
  if (!s || s.length > MAX_COMPRESSED * 1.4) throw new Error('too_large')
  const text = await inflate(b64urlDecode(s))
  if (text.length > MAX_JSON) throw new Error('too_large')
  return JSON.parse(text)
}

export async function decodeStatement(s: string): Promise<StatementPayload> {
  const parsed = PayloadSchema.parse(await decodeRaw(s))
  return parsed as StatementPayload
}

export async function decodeReply(s: string): Promise<ReplyPayload> {
  return ReplySchema.parse(await decodeRaw(s))
}

export function appBase(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function waLink(phone: string | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const num = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}
