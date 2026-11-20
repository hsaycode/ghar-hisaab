import { useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import i18n from './i18n'
import { useSettings } from './lib/hooks'
import { isEvening } from './lib/dates'
import { ToastHost } from './components/ui'
import { Landing } from './screens/Landing'
import { Onboarding } from './screens/Onboarding'
import { Today } from './screens/Today'
import { Accounts } from './screens/Accounts'
import { RegularDetail } from './screens/RegularDetail'
import { LedgerDetail } from './screens/LedgerDetail'
import { CashScreen } from './screens/CashScreen'
import { Month } from './screens/Month'
import { Settings } from './screens/Settings'
import { MyHouses, ReplyApply, VendorStatement } from './screens/Vendor'
import { Lab } from './screens/Lab'
import { Evals } from './screens/Evals'

function useTheme() {
  const s = useSettings()
  useEffect(() => {
    if (!s) return
    if (i18n.language !== s.displayLang) void i18n.changeLanguage(s.displayLang)
    document.documentElement.lang = s.displayLang
    document.title = i18n.getFixedT(s.displayLang)('app.name')
    document.documentElement.dataset.size = s.textSize
    const apply = () => {
      const night = s.nightMode === 'on' || (s.nightMode === 'auto' && s.ritual === 'evening' && isEvening())
      document.documentElement.dataset.theme = night ? 'night' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', night ? '#1A1814' : '#FBF7EF')
    }
    apply()
    const timer = window.setInterval(apply, 60_000)
    return () => window.clearInterval(timer)
  }, [s])
  return s
}

function Household({ children }: { children: ReactNode }) {
  const s = useSettings()
  if (!s) return null
  if (!s.onboarded) return <Navigate to="/" replace />
  return <>{children}</>
}

function Home() {
  const s = useSettings()
  if (!s) return null
  if (s.onboarded) return <Navigate to="/today" replace />
  return <Landing />
}

export default function App() {
  useTheme()
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/today" element={<Household><Today /></Household>} />
        <Route path="/accounts" element={<Household><Accounts /></Household>} />
        <Route path="/accounts/regular/:id" element={<Household><RegularDetail /></Household>} />
        <Route path="/accounts/khata/:id" element={<Household><LedgerDetail type="khata" /></Household>} />
        <Route path="/accounts/person/:id" element={<Household><LedgerDetail type="person" /></Household>} />
        <Route path="/accounts/cash" element={<Household><CashScreen /></Household>} />
        <Route path="/month" element={<Household><Month /></Household>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/v/:payload" element={<VendorStatement />} />
        <Route path="/r/:payload" element={<ReplyApply />} />
        <Route path="/vendor" element={<MyHouses />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/evals" element={<Evals />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </HashRouter>
  )
}
