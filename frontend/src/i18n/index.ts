import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hi from './hi.json'
import mr from './mr.json'
import bn from './bn.json'
import te from './te.json'
import ta from './ta.json'
import type { Lang } from '../lib/types'

export const LANGUAGE_NAMES: Record<Lang, { native: string; english: string }> = {
  hi: { native: 'हिन्दी', english: 'Hindi' },
  en: { native: 'English', english: 'English' },
  mr: { native: 'मराठी', english: 'Marathi' },
  bn: { native: 'বাংলা', english: 'Bengali' },
  te: { native: 'తెలుగు', english: 'Telugu' },
  ta: { native: 'தமிழ்', english: 'Tamil' },
}
export const BETA_LANGS: Lang[] = ['mr', 'bn', 'te', 'ta']

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, mr: { translation: mr }, bn: { translation: bn },
    te: { translation: te }, ta: { translation: ta } },
  lng: 'hi',
  fallbackLng: ['en'],
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n

/** Translate in a specific language without changing the UI language (e.g. vendor's language). */
export function tIn(lang: Lang, key: string, opts?: Record<string, unknown>): string {
  return i18n.getFixedT(lang)(key, opts) as string
}
