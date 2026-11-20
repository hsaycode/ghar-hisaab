// Recording lab: builds the voice eval dataset (local dev only; server must run with LAB_ENABLED=1).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Recorder } from '../lib/voice'
import { Topbar } from '../components/ui'

interface ScriptCase { id: string; lang: string; text: string; split: string }

export function Lab() {
  const nav = useNavigate()
  const { t } = useTranslation()
  const [cases, setCases] = useState<ScriptCase[]>([])
  const [speaker, setSpeaker] = useState(() => localStorage.getItem('lab-speaker') ?? '')
  const [lang, setLang] = useState('hi')
  const [idx, setIdx] = useState(0)
  const [state, setState] = useState<'idle' | 'rec' | 'saving'>('idle')
  const [log, setLog] = useState<string[]>([])
  const [freeform, setFreeform] = useState(false)
  const rec = useRef<Recorder | null>(null)

  useEffect(() => { fetch('/evals/lab_script.json').then((r) => r.json()).then(setCases).catch(() => setCases([])) }, [])
  const list = cases.filter((c) => c.lang === lang)
  const cur = list[idx]

  const record = async () => {
    if (!speaker.trim()) return alert('Enter a speaker id first (e.g. spk01). Use an anonymous id, not a real name.')
    localStorage.setItem('lab-speaker', speaker)
    const r = new Recorder()
    rec.current = r
    setState('rec')
    await r.start({ silenceMs: 3500, maxMs: 60000, noSpeechTimeoutMs: 10000 })
    const res = await r.result
    setState('saving')
    const caseId = freeform ? `free_${lang}_${Date.now()}` : cur.id
    const resp = await fetch(`/api/lab/save?speaker=${encodeURIComponent(speaker)}&case_id=${encodeURIComponent(caseId)}&lang=${lang}&kind=${freeform ? 'freeform' : 'scripted'}`,
      { method: 'POST', body: res.blob, headers: { 'Content-Type': res.mime || 'audio/webm' } })
    setLog((l) => [`${resp.ok ? '✓' : '✗ ' + resp.status} ${caseId}${res.hadSpeech ? '' : ' (no speech detected)'}`, ...l])
    setState('idle')
    if (resp.ok && !freeform) setIdx((i) => Math.min(list.length - 1, i + 1))
  }

  return (
    <div className="app"><div className="page no-tabs">
      <Topbar title={t('settings.lab')} back={() => nav(-1)} />
      <div className="banner">ℹ️ {t('settings.devNote')}</div>
      <div className="banner warn">Local only. Start the server with <code>LAB_ENABLED=1</code>. Get consent from every speaker first (docs/EVAL_PLAN.md §2).</div>
      <div className="card stack">
        <label className="label">Speaker id (anonymous)<input className="field" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="spk01" /></label>
        <div className="row wrap">{['hi', 'en', 'mr', 'bn', 'te', 'ta'].map((l) => <button key={l} className={`chip tiny${lang === l ? ' on' : ''}`} onClick={() => { setLang(l); setIdx(0) }}>{l}</button>)}</div>
        <button className={`choice${freeform ? ' on' : ''}`} onClick={() => setFreeform(!freeform)}><span className="e">🗣️</span>Free-form (simulated evening conversation)<span className="tick">✓</span></button>
      </div>
      <div className="card mt center">
        {freeform ? <p>Speak naturally, as if telling the day's spending after dinner. Label it later in <code>evals/cases/voice_labels.jsonl</code>.</p>
          : cur ? <><div className="small muted">{cur.id} · {idx + 1}/{list.length} · {cur.split}</div><p style={{ fontSize: '1.35rem', fontWeight: 800 }}>{cur.text}</p></>
            : <p className="muted">No script for this language yet.</p>}
        <button className="btn primary block" disabled={state !== 'idle' || (!freeform && !cur)} onClick={record}>
          {state === 'rec' ? 'Recording… (stops on silence)' : state === 'saving' ? 'Saving…' : '🎙️ Record'}
        </button>
        {state === 'rec' && <button className="btn ghost block mt" onClick={() => rec.current?.stop()}>Stop</button>}
        {!freeform && <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="chip tiny" onClick={() => setIdx(Math.max(0, idx - 1))}>‹ prev</button>
          <button className="chip tiny" onClick={() => setIdx(Math.min(list.length - 1, idx + 1))}>next ›</button>
        </div>}
      </div>
      {log.length > 0 && <pre className="mt">{log.join('\n')}</pre>}
    </div></div>
  )
}
