// Amount safety checks on the confirm card. NONE of these restrict what can be recognised:
// Whisper + the LLM recognise any amount. These only decide when to show a "please check" chip,
// and for known sound-alikes offer the other value as a one-tap alternative.
//
// Three layers, so coverage does not depend on a hand-written list being complete:
//  1. Language-agnostic: low ASR confidence on the clip  -> every amount gets a check chip.
//  2. Language-agnostic: implausible amount for the entry  (e.g. ₹3 of medicine, ₹80,000 of vegetables).
//  3. Language-specific sound-alike pairs (below). Seeded from how numbers are formed in each
//     language; the voice eval (evals/run_voice_eval.py) writes the confusions it actually observes
//     to `number_confusions` in every report, and those are added here. Precision/recall of the chip
//     is measured in the eval, so a weak list shows up as low flag recall instead of staying hidden.
import type { Lang } from './types'

/** Pairs a recogniser commonly swaps, with the reason, per language. */
export const CONFUSABLE_PAIRS: Record<Lang, [number, number][]> = {
  // saat/saath (7/60), satrah/sattar (17/70): differ by one final sound. teen/tees (3/30).
  // pachchees/pachaas (25/50). dedh sau / dhai sau (150/250): both fraction words before "sau".
  // sava sau / saade sau are rare; chhiyasath/chhiyasi (66/86) share the "chhiya-" prefix.
  hi: [[7, 60], [17, 70], [3, 30], [25, 50], [150, 250], [66, 86]],
  // saat/saath (सात/साठ), satra/sattar (सतरा/सत्तर), teen/tees (तीन/तीस), panchvees/pannas (25/50).
  mr: [[7, 60], [17, 70], [3, 30], [25, 50]],
  // saat/shaat (সাত/ষাট), sotero/sottor (সতেরো/সত্তর), der sho/arai sho (দেড়শো/আড়াইশো = 150/250).
  bn: [[7, 60], [17, 70], [150, 250]],
  // Units vs tens share the stem: ainthu/aimbathu (5/50), aaru/arubathu (6/60), ezhu/ezhubathu (7/70),
  // ettu/enbathu (8/80). A clipped "-pathu" turns tens into units.
  ta: [[5, 50], [6, 60], [7, 70], [8, 80]],
  // naalugu/nalabhai (4/40), aaru/aravai (6/60), enimidi/enabhai (8/80), tommidi/tombhai (9/90).
  te: [[4, 40], [6, 60], [8, 80], [9, 90]],
  // thirteen..nineteen vs thirty..ninety: the classic English teen/ty confusion.
  en: [[13, 30], [14, 40], [15, 50], [16, 60], [17, 70], [18, 80], [19, 90]],
}

export function confusableAlt(amount: number | null | undefined, lang: Lang): number | undefined {
  if (amount == null) return undefined
  for (const [a, b] of CONFUSABLE_PAIRS[lang] ?? []) {
    if (amount === a) return b
    if (amount === b) return a
  }
  return undefined
}

// Loose, generous bounds: only clearly odd amounts get a chip.
const CATEGORY_RANGE: Record<string, [number, number]> = {
  sabzi: [5, 5000], doodh: [10, 6000], dawai: [5, 50000], kirana: [5, 30000], travel: [10, 20000],
  pooja: [1, 50000], gas: [300, 5000], bills: [20, 50000], help: [50, 50000], fish: [20, 10000],
}

export function implausible(amount: number | null | undefined, kind: string, category?: string | null): boolean {
  if (amount == null) return false
  if (amount <= 0) return true
  if (kind === 'expense' && category && CATEGORY_RANGE[category]) {
    const [lo, hi] = CATEGORY_RANGE[category]
    return amount < lo || amount > hi
  }
  return amount > 500000
}
