import { describe, expect, it } from 'vitest'
import { buildPayload, decodeReply, decodeStatement, encodePayload, newSid, payloadHash } from './statement'
import { monthBill } from './billing'
import type { Regular } from './types'

const milk: Regular = { id: 1, name: 'दूधवाले भैया', nameKey: 'dudh', template: 'milk', category: 'doodh', billing: 'daily_qty', rate: 64,
  unit: 'L', defaultQty: 1, deductLeaves: false, allowedLeaves: 0, startDate: '2026-01-01', pauses: [], createdAt: 0 }

describe('statement links', () => {
  it('round-trips, stays short, and hashes deterministically', async () => {
    const bill = monthBill(milk, [{ regularId: 1, date: '2026-11-06', type: 'skip', createdAt: 1 }], '2026-11')
    const p = buildPayload(milk, bill, 'शर्मा घर', 'hi', newSid())
    const enc = await encodePayload(p)
    expect(enc.length).toBeLessThan(800)
    const back = await decodeStatement(enc)
    expect(back).toEqual(p)
    expect(await payloadHash(back)).toBe(await payloadHash(p))
    // Minimal payload: no phone numbers, UPI IDs or member names can travel in the link.
    const allowed = ['v', 'sid', 'ha', 'rn', 'tp', 'mo', 'b', 'u', 'r', 'd', 't', 'lg', 'exp', 'ded', 'adv']
    expect(Object.keys(back).every((k) => allowed.includes(k))).toBe(true)
  })

  it('rejects tampered or malformed payloads', async () => {
    await expect(decodeStatement('not-a-payload')).rejects.toBeTruthy()
    const evil = await encodePayload({ v: 1, sid: 'x', ha: '<script>', rn: 'a', tp: 'milk', mo: '2026-11', b: 'daily_qty', u: 'L', r: 1, d: '', t: -5, lg: 'hi', exp: 0 })
    await expect(decodeStatement(evil)).rejects.toBeTruthy()   // bad sid + negative total
  })

  it('reply carries no amounts and is validated', async () => {
    const r = await encodePayload({ v: 1, sid: 'abcdefghijkl', h: '0123456789abcdef', s: 'dispute', dd: [6, 14], n: 'came on 14th' })
    const back = await decodeReply(r)
    expect(back.dd).toEqual([6, 14])
    expect(Object.keys(back)).not.toContain('t')
    const bad = await encodePayload({ v: 1, sid: 'abcdefghijkl', h: 'zz', s: 'ok', dd: [], n: '' })
    await expect(decodeReply(bad)).rejects.toBeTruthy()
  })
})
