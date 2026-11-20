// Sample house for evaluators: realistic 2+ months of data in the chosen language, plus sample
// utterances with saved (cached) pipeline results so the demo works without a mic or AI quota.
import type { ParseResult, ParsedEntry } from './api'
import type { Entry, Lang, RegularEvent } from './types'
import { HisaabDB, DEFAULT_SETTINGS } from './db'
import { addDays, addMonths, monthOf, todayStr } from './dates'
import { nameKey } from './names'

interface DemoNames { house: string; dadi: string; dadaji: string; maid: string; shop: string; ramesh: string; friend: string; occasion: string; power: string }

export const DEMO_NAMES: Record<Lang, DemoNames> = {
  en: { house: 'Sharma home', dadi: 'Grandma', dadaji: 'Grandpa', maid: 'Kamla', shop: 'Gupta Kirana', ramesh: 'Ramesh', friend: 'Sharma ji', occasion: "daughter's wedding", power: 'electricity' },
  hi: { house: 'शर्मा घर', dadi: 'दादी', dadaji: 'दादाजी', maid: 'कमला दीदी', shop: 'गुप्ता किराना', ramesh: 'रमेश', friend: 'शर्मा जी', occasion: 'बेटी की शादी', power: 'बिजली' },
  mr: { house: 'पाटील घर', dadi: 'आजी', dadaji: 'आजोबा', maid: 'कमला ताई', shop: 'जोशी किराणा', ramesh: 'रमेश', friend: 'देशमुख काका', occasion: 'मुलीचे लग्न', power: 'वीज' },
  bn: { house: 'দাস বাড়ি', dadi: 'ঠাকুমা', dadaji: 'দাদু', maid: 'মালতী দি', shop: 'ঘোষ স্টোর', ramesh: 'রমেশ', friend: 'সেন বাবু', occasion: 'মেয়ের বিয়ে', power: 'বিদ্যুৎ' },
  te: { house: 'రెడ్డి గారి ఇల్లు', dadi: 'నానమ్మ', dadaji: 'తాతయ్య', maid: 'లక్ష్మి', shop: 'రాజు కిరాణా', ramesh: 'రమేష్', friend: 'శర్మ గారు', occasion: 'కూతురి పెళ్ళి', power: 'కరెంటు' },
  ta: { house: 'முருகன் வீடு', dadi: 'பாட்டி', dadaji: 'தாத்தா', maid: 'செல்வி', shop: 'ராஜா மளிகை', ramesh: 'ரமேஷ்', friend: 'சர்மா', occasion: 'மகள் திருமணம்', power: 'மின்சாரம்' },
}

function rng(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

export async function seedDemo(lang: Lang = 'hi'): Promise<void> {
  const N = DEMO_NAMES[lang] ?? DEMO_NAMES.en
  const d = new HisaabDB('gh-demo')
  await d.open()
  await Promise.all(d.tables.map((t) => t.clear()))
  const today = todayStr()
  const start = `${addMonths(monthOf(today), -2)}-01`
  const now = Date.now()
  const r = rng(42)

  await d.meta.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, onboarded: true, role: 'household', displayLang: lang,
    speechLang: lang, houseAlias: N.house, openingCash: 9000, openingCashDate: start, usage: ['daily', 'regular', 'khata', 'lena', 'income'] } })
  const mk = (name: string) => ({ name, nameKey: nameKey(name), createdAt: now })
  const dadi = await d.members.add(mk(N.dadi))   // auto-increment ids survive clear(), so never assume 1
  const dadaji = await d.members.add(mk(N.dadaji))
  const base = { pauses: [], createdAt: now, startDate: start, deductLeaves: false, allowedLeaves: 2, vendorLang: lang }
  const milk = await d.regulars.add({ ...base, name: 'doodhwala', nameKey: nameKey('doodhwala'), autoName: true, template: 'milk', category: 'doodh', billing: 'daily_qty', rate: 64, unit: 'L', defaultQty: 1 })
  await d.regulars.add({ ...base, name: 'akhbaar', nameKey: nameKey('akhbaar'), autoName: true, template: 'newspaper', category: 'bills', billing: 'daily_qty', rate: 6, unit: 'paper', defaultQty: 1 })
  const maid = await d.regulars.add({ ...base, name: N.maid, nameKey: nameKey(N.maid), template: 'maid', category: 'help', billing: 'monthly', rate: 2500, unit: 'month', defaultQty: 1 })
  const press = await d.regulars.add({ ...base, name: 'press', nameKey: nameKey('press'), autoName: true, template: 'press', category: 'help', billing: 'per_unit', rate: 10, unit: 'piece', defaultQty: 0 })
  const shop = await d.accounts.add(mk(N.shop))
  const ramesh = await d.people.add(mk(N.ramesh))
  const friend = await d.people.add(mk(N.friend))

  const entries: Entry[] = []
  const events: RegularEvent[] = []
  const add = (e: Omit<Entry, 'createdAt' | 'source' | 'mode'> & { mode?: Entry['mode'] }) =>
    entries.push({ mode: 'cash', source: 'demo', createdAt: now, ...e })

  for (let date = start; date <= today; date = addDays(date, 1)) {
    const dom = Number(date.slice(8))
    add({ date, kind: 'expense', amount: [40, 50, 60, 70, 80, 90][Math.floor(r() * 6)], category: 'sabzi', mode: r() < 0.25 ? 'upi' : 'cash' })
    if (r() < 0.18) add({ date, kind: 'expense', amount: [120, 240, 420, 560][Math.floor(r() * 4)], category: 'dawai', memberId: dadaji, mode: r() < 0.5 ? 'upi' : 'cash' })
    if (r() < 0.15) add({ date, kind: 'expense', amount: [30, 50, 80][Math.floor(r() * 3)], category: 'travel', memberId: dadaji })
    if (r() < 0.1) add({ date, kind: 'expense', amount: [21, 51, 101][Math.floor(r() * 3)], category: 'pooja', memberId: dadi })
    if (r() < 0.12) add({ date, kind: 'credit_purchase', amount: [180, 320, 450, 760][Math.floor(r() * 4)], category: 'kirana', accountId: shop })
    if (dom === 1) {
      add({ date, kind: 'income', amount: 38000, category: 'pension', mode: 'bank' })
      add({ date, kind: 'cash_withdrawal', amount: 10000 })
    }
    if (dom === 5) add({ date, kind: 'credit_payment', amount: 2500, accountId: shop, mode: 'upi' })
    if (dom === 9) add({ date, kind: 'expense', amount: 1105, category: 'gas' })
    if (dom === 14) add({ date, kind: 'expense', amount: 780 + Math.floor(r() * 200), category: 'bills', mode: 'upi', note: N.power })
    if (dom === 20) add({ date, kind: 'expense', amount: 650, category: 'dawai', mode: 'card', memberId: dadaji })
    if (r() < 0.07) events.push({ regularId: milk, date, type: 'skip', createdAt: now })
    else if (r() < 0.06) events.push({ regularId: milk, date, type: 'extra', qty: 0.5, createdAt: now })
    if (r() < 0.06) events.push({ regularId: maid, date, type: 'leave', createdAt: now })
    if (r() < 0.18) events.push({ regularId: press, date, type: 'units', qty: 4 + Math.floor(r() * 9), createdAt: now })
    if (date < today && r() < 0.85) await d.dayCloses.put({ date, closedAt: now })
  }
  for (const back of [-2, -1]) {
    const ym = addMonths(monthOf(today), back)
    add({ date: `${ym}-03`, kind: 'regular_payment', amount: 1900, regularId: milk, month: ym })
    add({ date: `${ym}-02`, kind: 'regular_payment', amount: 2500, regularId: maid, month: ym, mode: 'upi' })
  }
  const lastMonth = addMonths(monthOf(today), -1)
  add({ date: `${lastMonth}-12`, kind: 'loan_given', amount: 5000, personId: ramesh })
  add({ date: addDays(today, -6), kind: 'loan_repaid_to_us', amount: 2000, personId: ramesh })
  add({ date: `${lastMonth}-20`, kind: 'gift_given', amount: 1100, personId: friend, occasion: N.occasion })
  await d.entries.bulkAdd(entries)
  await d.regularEvents.bulkAdd(events)
  d.close()
}

const NO_CORRECTION = { present: false, target_hint: null, field: null, new_value: null }
const NO_QUESTION = { present: false, metric: null, category: null, range: null }

function pe(p: Partial<ParsedEntry> & { kind: string }): ParsedEntry {
  return { amount: null, amount_span: null, qty: null, rate: null, unit: null, category: null, member: null, person: null,
    account: null, regular: null, regular_event: null, mode: null, date_offset_days: 0, occasion: null, note: null,
    clarify: null, amount_check: p.amount != null ? 'derived' : 'none', rate_check: 'none', dropped_amount: null, ...p }
}

export interface SampleUtterance { id: string; lang: Lang; text: string; cached: ParseResult }

const EVENING: Record<Lang, string> = {
  en: "Vegetables for 60, Grandpa's medicine 420 paid on GPay, he gave 50 for the auto, and the milkman didn't come today",
  hi: 'सब्ज़ी साठ रुपये की, दादाजी की दवाई चार सौ बीस फ़ोनपे से, उन्होंने ऑटो में पचास दिए, और आज दूधवाला नहीं आया',
  mr: 'भाजी साठ रुपये, आजोबांचे औषध चारशे वीस फोनपेने, त्यांनी रिक्षाला पन्नास दिले, आणि आज दूधवाला आला नाही',
  bn: 'সবজি ষাট টাকা, দাদুর ওষুধ চারশো কুড়ি টাকা ফোনপে-তে, উনি রিকশায় পঞ্চাশ দিলেন, আর আজ দুধওয়ালা আসেনি',
  te: 'కూరగాయలు అరవై రూపాయలు, తాతయ్య మందులు నాలుగు వందల ఇరవై ఫోన్‌పేలో, ఆయన ఆటోకి యాభై ఇచ్చారు, ఈరోజు పాలవాడు రాలేదు',
  ta: 'காய்கறி அறுபது ரூபாய், தாத்தாவின் மருந்து நானூற்று இருபது போன்பேயில், அவர் ஆட்டோவுக்கு ஐம்பது கொடுத்தார், இன்று பால்காரர் வரவில்லை',
}
const KHATA: Record<Lang, string> = {
  en: "Groceries worth 450 on Gupta Kirana's account, and Ramesh returned 1000",
  hi: 'गुप्ता किराना के खाते में साढ़े चार सौ का सामान, और रमेश ने एक हज़ार लौटाए',
  mr: 'जोशी किराणा खात्यावर साडेचारशेचे सामान, आणि रमेशने एक हजार परत दिले',
  bn: 'ঘোষ স্টোরের খাতায় সাড়ে চারশো টাকার জিনিস, আর রমেশ এক হাজার ফেরত দিল',
  te: 'రాజు కిరాణా ఖాతాలో నాలుగు వందల యాభై సామాను, రమేష్ వెయ్యి తిరిగి ఇచ్చాడు',
  ta: 'ராஜா மளிகைக் கணக்கில் நானூற்று ஐம்பது ரூபாய் சாமான், ரமேஷ் ஆயிரம் திருப்பிக் கொடுத்தார்',
}

export function sampleUtterances(lang: Lang): SampleUtterance[] {
  const N = DEMO_NAMES[lang] ?? DEMO_NAMES.en
  return [
    { id: `evening-${lang}`, lang, text: EVENING[lang], cached: { intent: 'log', correction: NO_CORRECTION, question: NO_QUESTION, entries: [
      pe({ kind: 'expense', amount: 60, category: 'sabzi' }),
      pe({ kind: 'expense', amount: 420, category: 'dawai', member: N.dadaji, mode: 'upi' }),
      pe({ kind: 'expense', amount: 50, category: 'travel', member: N.dadaji }),
      pe({ kind: 'regular_event', regular: 'doodhwala', regular_event: 'skip' }),
    ] } },
    { id: `khata-${lang}`, lang, text: KHATA[lang], cached: { intent: 'log', correction: NO_CORRECTION, question: NO_QUESTION, entries: [
      pe({ kind: 'credit_purchase', amount: 450, category: 'kirana', account: N.shop }),
      pe({ kind: 'loan_repaid_to_us', amount: 1000, person: N.ramesh }),
    ] } },
  ]
}
