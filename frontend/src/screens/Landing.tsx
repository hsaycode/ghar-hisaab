import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { saveSettings, switchMode } from '../lib/db'
import { seedDemo } from '../lib/demo'
import i18n, { LANGUAGE_NAMES } from '../i18n'
import type { Lang } from '../lib/types'
import { MicIcon } from '../components/ui'

export function Landing() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const lang = (i18n.language as Lang) || 'hi'
  const openDemo = async () => { await seedDemo(lang); switchMode('demo', '#/today') }
  const pickLang = (l: Lang) => { void i18n.changeLanguage(l); void saveSettings({ displayLang: l, speechLang: l }) }
  const steps = [1, 2, 3] as const

  return (
    <div className="app">
      <div className="landing">
        <header className="row between">
          <div className="brand"><img src="/icon.svg" alt="" />{t('app.name')}</div>
          <select className="chip" aria-label={t('common.language')} value={lang} onChange={(e) => pickLang(e.target.value as Lang)}>
            {(Object.keys(LANGUAGE_NAMES) as Lang[]).map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l].native}</option>)}
          </select>
        </header>

        <section className="hero">
          <h1>{t('landing.title')}</h1>
          <p className="lead">{t('landing.subtitle')}</p>
        </section>

        <figure className="preview" aria-label={t('landing.how')}>
          <div className="preview-say">
            <span className="preview-mic" aria-hidden><MicIcon /></span>
            <p>“{t('landing.demoSay')}”</p>
          </div>
          <ul className="preview-list">
            <li><span>🥬 {t('cat.sabzi')}</span><b>₹60</b></li>
            <li><span>💊 {t('cat.dawai')}</span><b>₹420</b></li>
            <li><span>🥛 {t('tpl.milk')}</span><span className="badge">{t('landing.didntCome')}</span></li>
          </ul>
        </figure>

        <div className="cta">
          <button className="btn primary block" onClick={() => { void saveSettings({ role: 'household' }); nav('/onboarding') }}>{t('landing.start')}</button>
          <button className="btn secondary block" onClick={openDemo}>{t('landing.demo')}</button>
        </div>

        <section className="how">
          <h2>{t('landing.how')}</h2>
          <ol className="steps">
            {steps.map((n) => (
              <li key={n}>
                <span className="step-n" aria-hidden>{n}</span>
                <div>
                  <h3>{t(`landing.s${n}t`)}</h3>
                  <p>{t(`landing.s${n}d`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="landing-foot">
          <button className="link-btn" onClick={() => { void saveSettings({ role: 'vendor' }); nav('/vendor') }}>{t('landing.vendor')}</button>
          <p className="footer-note">{t('landing.prototype')}</p>
        </footer>
      </div>
    </div>
  )
}
