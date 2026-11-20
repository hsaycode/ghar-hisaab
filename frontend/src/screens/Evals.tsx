// Public, transparent eval results: whatever the latest published run produced.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Topbar } from '../components/ui'

interface Metric { name: string; value: number | null; n?: number; ci?: [number, number] | null; note?: string }
interface Run {
  run_id: string; created_at: string; split: string; layer: string; model?: string; prompt_version?: string; prompt_hash?: string
  cases_hash?: string; code_hash?: string; n_cases: number; metrics: Metric[]; by_lang?: Record<string, Metric[]>
  failures?: { id: string; text: string; expected: string; got: string; error_type: string }[]
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

export function Evals() {
  const nav = useNavigate()
  const { t } = useTranslation()
  const [runs, setRuns] = useState<Run[] | null>(null)
  useEffect(() => { fetch('/evals/latest.json').then((r) => (r.ok ? r.json() : [])).then((j) => setRuns(Array.isArray(j) ? j : [j])).catch(() => setRuns([])) }, [])
  return (
    <div className="app"><div className="page no-tabs">
      <Topbar title={t('settings.evals')} back={() => nav(-1)} />
      <div className="banner">ℹ️ {t('settings.devNote')}</div>
      <p className="small muted">Published by <code>evals/run_*.py --publish</code>. Every number below links back to a run folder in <code>evals/runs/</code> with per-case predictions, so anyone can recompute it. Methodology: <code>docs/EVAL_PLAN.md</code>.</p>
      {runs === null ? null : runs.length === 0 ? <div className="card empty">No published run yet.</div> : runs.map((r) => (
        <div key={r.run_id} className="card mt">
          <div className="row between wrap"><b>{r.layer} · {r.split}</b><span className="badge">{r.created_at.slice(0, 16).replace('T', ' ')}</span></div>
          <div className="small muted" style={{ marginTop: 4 }}>
            run <code>{r.run_id}</code> · n={r.n_cases}{r.model ? ` · ${r.model}` : ''}{r.prompt_version ? ` · ${r.prompt_version} (${r.prompt_hash})` : ''}<br />
            cases sha256 <code>{r.cases_hash?.slice(0, 12)}</code>{r.code_hash ? <> · code <code>{r.code_hash.slice(0, 12)}</code></> : null}
          </div>
          <table className="metrics mt">
            <thead><tr><th>Metric</th><th>Value</th><th>95% CI</th><th>n</th></tr></thead>
            <tbody>{r.metrics.map((m) => (
              <tr key={m.name}><td>{m.name}{m.note ? <div className="small muted">{m.note}</div> : null}</td><td><b>{m.name.includes('latency') ? `${m.value} ms` : pct(m.value)}</b></td>
                <td>{m.ci ? `${pct(m.ci[0])}–${pct(m.ci[1])}` : '—'}</td><td>{m.n ?? ''}</td></tr>))}</tbody>
          </table>
          {r.by_lang && Object.keys(r.by_lang).length > 1 && (
            <table className="metrics mt">
              <thead><tr><th>Lang</th>{r.by_lang[Object.keys(r.by_lang)[0]].map((m) => <th key={m.name}>{m.name}</th>)}</tr></thead>
              <tbody>{Object.entries(r.by_lang).map(([l, ms]) => <tr key={l}><td>{l}</td>{ms.map((m) => <td key={m.name}>{pct(m.value)}<div className="small muted">n={m.n}</div></td>)}</tr>)}</tbody>
            </table>
          )}
          {r.failures && r.failures.length > 0 && (
            <details className="mt"><summary>Failure gallery ({r.failures.length})</summary>
              {r.failures.map((f) => <pre key={f.id}>{`${f.id} [${f.error_type}]\n“${f.text}”\nexpected: ${f.expected}\ngot:      ${f.got}`}</pre>)}
            </details>
          )}
        </div>
      ))}
    </div></div>
  )
}
