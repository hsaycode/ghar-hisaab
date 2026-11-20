import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, parse, transcribe, type ParseContext, type ParseResult } from '../lib/api'
import { blankDraft, commitDrafts, draftsFromResult, missing, planCorrection, type CorrectionPlan, type Draft, type HouseData } from '../lib/drafts'
import { db } from '../lib/db'
import { allCategories } from '../lib/categories'
import { tIn } from '../i18n'
import { isEvening, todayStr } from '../lib/dates'
import { Recorder } from '../lib/voice'
import { deviceAsrSupported, listenOnce } from '../lib/deviceAsr'
import { draftLabel, readbackText, speak, stopSpeaking } from '../lib/readback'
import type { Entry, Settings } from '../lib/types'
import type { SampleUtterance } from '../lib/demo'
import { inr } from '../lib/money'
import { DraftCard } from './DraftCard'
import { EditDraftSheet } from './EditDraftSheet'
import { MicIcon, Sheet, toast } from './ui'

type Stage = 'listening' | 'processing' | 'confirm' | 'error' | 'device'

interface Props {
  open: boolean
  house: HouseData & { entries: Entry[] }
  settings: Settings
  baseDate: string
  sample?: SampleUtterance | null
  sampleLive?: boolean
  practice?: boolean
  onPracticeDone?: () => void
  onClose: () => void
}

export function buildContext(house: HouseData, settings: Settings): ParseContext {
  return {
    members: house.members.filter((m) => !m.archived).map((m) => m.name),
    regulars: house.regulars.filter((r) => !r.archived)
      .map((r) => ({ name: r.autoName ? tIn(settings.speechLang, `tpl.${r.template}`) : r.name, category: r.category })),
    accounts: house.accounts.filter((a) => !a.archived).map((a) => a.name),
    people: house.people.filter((p) => !p.archived).map((p) => p.name).slice(0, 20),
    categories: allCategories(settings.displayLang, settings.usage),
  }
}

function hintWords(house: HouseData, settings: Settings): string[] {
  const names = [
    ...house.members.filter((m) => !m.archived).map((m) => m.name),
    ...house.regulars.filter((r) => !r.archived).map((r) => (r.autoName ? tIn(settings.speechLang, `tpl.${r.template}`) : r.name)),
    ...house.accounts.filter((a) => !a.archived).map((a) => a.name),
  ]
  const cats = ['sabzi', 'doodh', 'dawai', 'kirana', 'gas', 'travel'].map((c) => tIn(settings.speechLang, `cat.${c}`))
  return [...names, ...cats]
}

export function VoiceSession({ open, house, settings, baseDate, sample, sampleLive, practice, onPracticeDone, onClose }: Props) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<Stage>('listening')
  const [level, setLevel] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [transcript, setTranscript] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [error, setError] = useState<{ msg: string; quota?: boolean } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [correction, setCorrection] = useState<CorrectionPlan | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [singleKey, setSingleKey] = useState<string | null>(null)
  const recRef = useRef<Recorder | null>(null)
  const parseLang = useRef<Settings['speechLang']>(settings.speechLang)
  const lowConf = useRef(false)
  const deviceStop = useRef<(() => void) | null>(null)
  const draftsRef = useRef<Draft[]>([])
  draftsRef.current = drafts

  const lang = settings.speechLang
  const ctx = buildContext(house, settings)

  const applyResult = useCallback((result: ParseResult, replaceKey: string | null) => {
    if (result.intent === 'question') { setInfo(t('confirm.question')); setStage('confirm'); return }
    if (result.intent === 'correction') {
      const recent = house.entries.filter((e) => e.date >= baseDate.slice(0, 8) + '01').filter((e) => e.date <= baseDate)
      const plan = planCorrection(result, recent.length ? recent : house.entries)
      if (plan) { setCorrection(plan); setStage('confirm'); return }
    }
    const next = draftsFromResult(result, house, parseLang.current, { lowConfidence: lowConf.current })
    if (!next.length) {
      if (!draftsRef.current.length) { setError({ msg: t('confirm.unclear') }); setStage('error'); return }
      setStage('confirm'); return
    }
    let merged: Draft[]
    if (replaceKey) {
      merged = draftsRef.current.map((d) => (d.key === replaceKey ? { ...next[0], key: d.key } : d))
    } else {
      merged = [...draftsRef.current, ...next]
    }
    setDrafts(merged)
    setStage('confirm')
    if (settings.readAloud && !practice) void speak(readbackText(replaceKey ? [next[0]] : next, t, house.regulars, house.members), settings.displayLang)
    if (practice) void speak(readbackText(next, t, house.regulars, house.members), settings.displayLang)
  }, [baseDate, house, practice, settings.displayLang, settings.readAloud, t])

  const runParse = useCallback(async (text: string, replaceKey: string | null, langOverride?: Settings['speechLang']) => {
    setTranscript((prev) => (replaceKey || !prev ? text : `${prev} · ${text}`))
    setStage('processing')
    parseLang.current = langOverride ?? lang
    try {
      const { result } = await parse(text, parseLang.current, baseDate, ctx)
      applyResult(result, replaceKey)
    } catch (e) {
      const quota = e instanceof ApiError && (e.status === 429 || e.status === 503)
      setError({ msg: quota ? t('mic.busy') : t('mic.error'), quota })
      setStage('error')
    }
  }, [applyResult, baseDate, ctx, lang, t])

  const startListening = useCallback(async (replaceKey: string | null = null) => {
    stopSpeaking()
    setSingleKey(replaceKey)
    setError(null)
    setCountdown(null)
    setStage('listening')
    const rec = new Recorder()
    recRef.current = rec
    const evening = settings.ritual === 'evening' && isEvening()
    try {
      await rec.start({
        silenceMs: evening ? 6000 : 4000, maxMs: 90000, noSpeechTimeoutMs: 10000,
        onLevel: (l) => setLevel(l), onCountdown: setCountdown,
      })
    } catch (e) {
      const denied = (e as DOMException)?.name === 'NotAllowedError'
      setError({ msg: denied ? t('mic.denied') : t('mic.error') })
      setStage('error')
      return
    }
    const res = await rec.result
    if (recRef.current !== rec) return
    if (!res.hadSpeech) { setError({ msg: t('mic.noSpeech') }); setStage('error'); return }
    setStage('processing')
    try {
      const tx = await transcribe(res.blob, res.mime, lang, hintWords(house, settings))
      if (!tx.text.trim()) { setError({ msg: t('mic.noSpeech') }); setStage('error'); return }
      lowConf.current = tx.low_confidence   // unsure audio: every amount gets a "please check" chip
      await runParse(tx.text, replaceKey)
    } catch (e) {
      const quota = e instanceof ApiError && (e.status === 429 || e.status === 503)
      setError({ msg: quota ? t('mic.busy') : t('mic.error'), quota })
      setStage('error')
    }
  }, [house, lang, runParse, settings, t])

  // Start when opened.
  useEffect(() => {
    if (!open) return
    setDrafts([]); setTranscript(''); setInfo(null); setCorrection(null); setError(null)
    lowConf.current = false
    if (sample) {
      setTranscript(sample.text)
      setStage('processing')
      parseLang.current = sample.lang
      if (sampleLive) void runParse(sample.text, null, sample.lang)
      else window.setTimeout(() => applyResult(sample.cached, null), 700)
    } else {
      void startListening(null)
    }
    return () => { recRef.current?.cancel(); recRef.current = null; deviceStop.current?.(); stopSpeaking() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const useDevice = () => {
    setStage('device')
    setTranscript('')
    const { promise, stop } = listenOnce(lang, (txt) => setTranscript(txt))
    deviceStop.current = stop
    lowConf.current = false
    promise.then((txt) => { if (txt) void runParse(txt, singleKey); else { setError({ msg: t('mic.noSpeech') }); setStage('error') } })
      .catch(() => { setError({ msg: t('mic.error') }); setStage('error') })
  }

  const save = async () => {
    if (practice) { onPracticeDone?.(); onClose(); return }
    if (correction) {
      await db.entries.update(correction.entry.id as number, { [correction.field]: correction.after })
      toast(t('confirm.saved'))
      onClose()
      return
    }
    const ready = drafts.filter((d) => !missing(d))
    const rest = drafts.filter((d) => missing(d))
    if (!ready.length && rest.length) {
      setEditing(rest[0])
      return
    }
    await commitDrafts(ready, baseDate)
    toast(`${t('confirm.saved')} ✓ ${ready.length}`)
    if (rest.length) {
      setDrafts(rest)
      const first = rest[0]
      void speak(`${draftLabel(first, t, house.regulars)}. ${t('confirm.ask')}`, settings.displayLang)
      setEditing(first)
    } else {
      onClose()
    }
  }

  const total = drafts.reduce((s, d) => s + (d.kind !== 'regular_event' && d.amount ? d.amount : 0), 0)
  const readyCount = drafts.filter((d) => !missing(d)).length

  return (
    <>
      <Sheet open={open} onClose={() => { recRef.current?.cancel(); onClose() }} label={t('mic.listening')}>
        {(stage === 'listening' || stage === 'device') && (
          <div className="listening">
            <div className="ring-wrap" aria-hidden>
              <div className="ring" style={{ transform: `scale(${0.75 + level * 0.35})` }} />
              {countdown != null && (
                <svg className="countdown" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="47" fill="none" stroke="var(--ink)" strokeWidth="3"
                    strokeDasharray={`${(countdown / 2000) * 295} 295`} transform="rotate(-90 50 50)" />
                </svg>
              )}
              <div className="ring-core"><MicIcon /></div>
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }} aria-live="polite">
              {countdown != null ? t('mic.stopping', { s: Math.ceil(countdown / 1000) }) : t('mic.listening')}
            </div>
            {stage === 'device' && transcript && <p className="transcript mt">{transcript}</p>}
            {stage === 'listening' && !singleKey && !drafts.length && !practice && (
              <p className="muted small mt">{t('onb.voice.try')}: “{t('onb.voice.example')}”</p>
            )}
            <div className="sheet-actions">
              <button className="btn primary block" onClick={() => (stage === 'device' ? deviceStop.current?.() : recRef.current?.stop())}>
                ✓ {t('mic.done')}
              </button>
            </div>
          </div>
        )}

        {stage === 'processing' && (
          <div className="listening">
            <div className="ring-wrap" aria-hidden><div className="ring" /><div className="ring-core"><MicIcon /></div></div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }} className="dots" aria-live="polite">{t('mic.understanding')}</div>
            {transcript && <p className="transcript mt"><span className="muted small">{t('mic.heard')}: </span>{transcript}</p>}
          </div>
        )}

        {stage === 'error' && error && (
          <div className="listening">
            <div className="empty"><div className="e">🙉</div><p style={{ fontWeight: 700, color: 'var(--ink)' }}>{error.msg}</p></div>
            <div className="sheet-actions">
              {error.quota && deviceAsrSupported() && <button className="btn primary block" onClick={useDevice}>🎤 {t('mic.useDevice')}</button>}
              <button className="btn secondary block" onClick={() => void startListening(singleKey)}>{t('common.retry')}</button>
              <button className="btn ghost block" onClick={() => { setEditing(blankDraft()); setStage('confirm') }}>⌨️ {t('common.typeInstead')}</button>
            </div>
          </div>
        )}

        {stage === 'confirm' && (
          <div>
            <h2>{practice ? t('onb.voice.great') : t('confirm.title')}</h2>
            {transcript && <p className="transcript"><span className="muted small">{t('mic.heard')}: </span>{transcript}</p>}
            {info && <div className="banner mt">ℹ️ {info}</div>}
            {correction && (
              <div className="draft mt">
                <div className="title" style={{ fontWeight: 700 }}>{t('confirm.change')}</div>
                <div className="row between mt">
                  <span>{correction.entry.category ? t(`cat.${correction.entry.category}`) : t(`kind.${correction.entry.kind}`)}</span>
                  <span className="amount">
                    {correction.field === 'amount' ? `${inr(Number(correction.before))} → ${inr(Number(correction.after))}` : `${correction.before} → ${correction.after}`}
                  </span>
                </div>
              </div>
            )}
            <div className="mt">
              {drafts.map((d, i) => (
                <DraftCard key={d.key} draft={d} index={i} members={house.members} regulars={house.regulars}
                  onEdit={() => setEditing(d)}
                  onRemove={() => setDrafts(drafts.filter((x) => x.key !== d.key))}
                  onRerecord={practice ? undefined : () => void startListening(d.key)}
                  onPatch={(p) => setDrafts(drafts.map((x) => (x.key === d.key ? { ...x, ...p } : x)))} />
              ))}
            </div>
            {drafts.length > 1 && <div className="row between mt" style={{ padding: '0 4px' }}><span className="muted">{t('common.total')}</span><span className="amount">{inr(total)}</span></div>}
            <div className="sheet-actions">
              {(drafts.length > 0 || correction) && (
                <button className="btn primary block" onClick={save}>
                  ✓ {practice ? t('common.continue') : correction ? t('common.confirm') : readyCount > 1 ? t('confirm.saveN', { n: readyCount }) : t('confirm.save')}
                </button>
              )}
              {!practice && !correction && (
                <div className="row">
                  <button className="btn secondary grow" onClick={() => void startListening(null)}>🎤 {t('mic.sayMore')}</button>
                  <button className="btn ghost" onClick={() => void speak(readbackText(drafts, t, house.regulars, house.members), settings.displayLang)} aria-label={t('common.readAgain')}>🔊</button>
                </div>
              )}
              {!practice && !correction && <button className="link-btn" onClick={() => setEditing(blankDraft())}>⌨️ {t('common.typeInstead')}</button>}
              {(info && !drafts.length) && <button className="btn ghost block" onClick={onClose}>{t('common.close')}</button>}
            </div>
          </div>
        )}
      </Sheet>

      <EditDraftSheet open={!!editing} draft={editing} members={house.members} regulars={house.regulars} settings={settings}
        onClose={() => setEditing(null)}
        onSave={(nd) => {
          setDrafts((cur) => (cur.some((x) => x.key === nd.key) ? cur.map((x) => (x.key === nd.key ? nd : x)) : [...cur, nd]))
          setEditing(null)
          setStage('confirm')
        }} />
    </>
  )
}

export function todayBase(): string { return todayStr() }
