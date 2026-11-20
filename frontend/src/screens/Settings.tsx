import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import i18n, { BETA_LANGS, LANGUAGE_NAMES } from '../i18n'
import { db, mode, saveSettings, switchMode } from '../lib/db'
import { seedDemo } from '../lib/demo'
import { useSettings } from '../lib/hooks'
import type { Lang } from '../lib/types'
import { LANGS } from '../lib/types'
import { TabBar, Topbar, toast } from '../components/ui'

export function Settings() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  if (!settings) return null

  const setLang = (l: Lang) => {
    if (l === settings.displayLang) return
    if (!window.confirm(i18n.getFixedT(l)('settings.switchLangQ', { lang: LANGUAGE_NAMES[l].native }))) return
    void i18n.changeLanguage(l)
    if (mode === 'demo') {
      // The sample house is sample data: rebuild it in the newly chosen language.
      void seedDemo(l).then(() => window.location.reload())
      return
    }
    void saveSettings({ displayLang: l, speechLang: l })
  }

  const exportBackup = async () => {
    const data: Record<string, unknown> = {}
    for (const table of db.tables) data[table.name] = await table.toArray()
    const blob = new Blob([JSON.stringify({ app: 'ghar-hisaab', version: 1, exportedAt: new Date().toISOString(), data })], { type: 'application/json' })
    const file = new File([blob], `ghar-hisaab-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Ghar Hisaab backup' }); return } catch { /* fall through */ }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    a.click()
  }

  const importBackup = async (f: File) => {
    try {
      const json = JSON.parse(await f.text())
      if (json.app !== 'ghar-hisaab') throw new Error('bad')
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear()
          const rows = json.data?.[table.name]
          if (Array.isArray(rows) && rows.length) await table.bulkAdd(rows)
        }
      })
      toast(t('settings.restored'))
      window.location.reload()
    } catch { toast(t('mic.error')) }
  }

  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
    <div className="row wrap">{options.map(([v, l]) => <button key={v} className={`chip${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>{l}</button>)}</div>
  )

  return (
    <div className="app">
      <div className="page">
        <Topbar title={t('settings.title')} back={() => nav(-1)} />
        <div className="card stack">
          <div><div className="label">{t('settings.language')}</div>
            <div className="row wrap" style={{ marginTop: 6 }}>{LANGS.map((l) => (
              <button key={l} className={`chip${settings.displayLang === l ? ' on' : ''}`} onClick={() => setLang(l)}>
                {LANGUAGE_NAMES[l].native}{BETA_LANGS.includes(l) ? ' ·β' : ''}
              </button>))}</div></div>
          <div><div className="label">{t('settings.speech')}</div>
            <div className="row wrap" style={{ marginTop: 6 }}>{LANGS.map((l) => (
              <button key={l} className={`chip tiny${settings.speechLang === l ? ' on' : ''}`} onClick={() => saveSettings({ speechLang: l })}>{LANGUAGE_NAMES[l].native}</button>))}</div></div>
          <div><div className="label">{t('settings.text')}</div>
            <Seg value={settings.textSize} options={[['L', t('settings.large')], ['XL', t('settings.xl')]]} onChange={(v) => saveSettings({ textSize: v })} /></div>
          <div><div className="label">{t('settings.night')}</div>
            <Seg value={settings.nightMode} options={[['auto', t('settings.auto')], ['on', t('settings.on')], ['off', t('settings.off')]]} onChange={(v) => saveSettings({ nightMode: v })} /></div>
          <button className={`choice${settings.readAloud ? ' on' : ''}`} onClick={() => saveSettings({ readAloud: !settings.readAloud })}>
            <span className="e">🔊</span>{t('settings.read')}<span className="tick">✓</span>
          </button>
        </div>

        <div className="h2">{t('settings.backup')}</div>
        <div className="card stack">
          <button className="btn secondary block" onClick={exportBackup}>💾 {t('settings.export')}</button>
          <button className="btn ghost block" onClick={() => fileRef.current?.click()}>📂 {t('settings.import')}</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f) }} />
        </div>

        <div className="h2">{t('settings.demo')}</div>
        <div className="card stack">
          {mode === 'demo'
            ? <>
              <button className="btn secondary block" onClick={() => switchMode('main', '#/')}>🏠 {t('settings.backMain')}</button>
              <button className="btn ghost block" onClick={async () => { await seedDemo(settings.displayLang); window.location.reload() }}>↺ {t('settings.resetDemo')}</button>
            </>
            : <button className="btn secondary block" onClick={async () => { await seedDemo(settings.displayLang); switchMode('demo') }}>👀 {t('settings.openDemo')}</button>}
          <Link className="btn ghost block" to="/vendor">🧾 {t('settings.vendor')}</Link>
        </div>

        <div className="h2">{t('settings.about')}</div>
        <div className="card">
          <p className="small" style={{ marginTop: 0 }}>{t('settings.aboutText')}</p>
          <div className="row wrap">
            <Link className="chip tiny" to="/evals">📊 {t('settings.evals')}</Link>
            <Link className="chip tiny" to="/lab">🎙️ {t('settings.lab')}</Link>
          </div>
        </div>

        <button className="btn danger block mt-l" onClick={async () => {
          if (!window.confirm(t('settings.deleteQ'))) return
          await db.delete()
          switchMode('main', '#/')
        }}>🗑 {t('settings.delete')}</button>
      </div>
      <TabBar />
    </div>
  )
}
