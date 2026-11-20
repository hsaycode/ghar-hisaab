import type { Billing, Lang, Usage } from './types'

export const CATEGORY_EMOJI: Record<string, string> = {
  kirana: '🛒', sabzi: '🥬', doodh: '🥛', dawai: '💊', bills: '💡', gas: '🔥', help: '🧹', travel: '🛺',
  pooja: '🪔', family: '🎁', fish: '🐟', other: '📦',
  seed: '🌱', fertiliser: '🧪', pesticide: '🧴', labour: '👷', irrigation: '⛽', machine: '🚜', fodder: '🌾', market: '🏪',
  pension: '🏦', interest: '💹', rent: '🏠', salary: '💼', crop_sale: '🌾', milk_sale: '🥛', other_income: '💰',
}

const HOME = ['kirana', 'sabzi', 'doodh', 'dawai', 'bills', 'gas', 'help', 'travel', 'pooja', 'family', 'other']
const FARM = ['seed', 'fertiliser', 'pesticide', 'labour', 'irrigation', 'machine', 'fodder', 'market']
const INCOME = ['pension', 'interest', 'rent', 'salary', 'other_income']
const FARM_INCOME = ['crop_sale', 'milk_sale']

export function expenseCategories(lang: Lang, usage: Usage[]): string[] {
  const list = [...HOME]
  if (lang === 'bn') list.splice(2, 0, 'fish')
  if (usage.includes('farm')) list.splice(list.length - 1, 0, ...FARM)
  return list
}

export function incomeCategories(usage: Usage[]): string[] {
  return usage.includes('farm') ? [...FARM_INCOME, ...INCOME] : INCOME
}

export function allCategories(lang: Lang, usage: Usage[]): string[] {
  return [...expenseCategories(lang, usage), ...incomeCategories(usage)]
}

export function emoji(cat?: string | null): string {
  return (cat && CATEGORY_EMOJI[cat]) || '📦'
}

export interface RegularTemplate {
  id: string
  emoji: string
  category: string
  billing: Billing
  rate: number
  unit: string
  defaultQty: number
  synonyms: string[]
}

export const REGULAR_TEMPLATES: RegularTemplate[] = [
  { id: 'milk', emoji: '🥛', category: 'doodh', billing: 'daily_qty', rate: 64, unit: 'L', defaultQty: 1,
    synonyms: ['doodh', 'dudh', 'milk', 'दूध', 'दूधवाला', 'doodhwala', 'दूध', 'দুধ', 'పాలు', 'பால்', 'gwala', 'ग्वाला'] },
  { id: 'newspaper', emoji: '📰', category: 'bills', billing: 'daily_qty', rate: 6, unit: 'paper', defaultQty: 1,
    synonyms: ['akhbaar', 'akhbar', 'paper', 'newspaper', 'अखबार', 'अख़बार', 'पेपर', 'वृत्तपत्र', 'খবরের কাগজ', 'পেপার', 'పేపర్', 'பேப்பர்'] },
  { id: 'maid', emoji: '🧹', category: 'help', billing: 'monthly', rate: 2500, unit: 'month', defaultQty: 1,
    synonyms: ['maid', 'bai', 'kaamwali', 'kamwali', 'बाई', 'कामवाली', 'मेड', 'কাজের লোক', 'పనిమనిషి', 'வேலைக்காரி'] },
  { id: 'cook', emoji: '🍳', category: 'help', billing: 'monthly', rate: 3000, unit: 'month', defaultQty: 1,
    synonyms: ['cook', 'khana banane wali', 'रसोइया', 'कुक', 'রাঁধুনি', 'వంటమనిషి', 'சமையல்'] },
  { id: 'press', emoji: '👔', category: 'help', billing: 'per_unit', rate: 10, unit: 'piece', defaultQty: 0,
    synonyms: ['press', 'istri', 'iron', 'dhobi', 'प्रेस', 'इस्त्री', 'धोबी', 'ইস্ত্রি', 'ধোবা', 'ఇస్త్రీ', 'இஸ்திரி'] },
  { id: 'water', emoji: '💧', category: 'bills', billing: 'per_unit', rate: 40, unit: 'can', defaultQty: 0,
    synonyms: ['paani', 'pani', 'water', 'can', 'पानी', 'জল', 'నీళ్ళు', 'தண்ணீர்'] },
]

export function templateFor(id: string): RegularTemplate | undefined {
  return REGULAR_TEMPLATES.find((t) => t.id === id)
}
