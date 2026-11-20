// Script-neutral matching key so "Gupta ji" and "गुप्ता जी" resolve to the same account.
const HONORIFICS = /\b(ji|jee|bhai|bhaiya|didi|di|sahab|saheb|aunty|uncle|ki|ke|ka|ko|ne|se|store|kirana|dukaan|dukan|shop|wale|wala|waale|waala)\b/g
const DEVA_HONORIFICS = /(जी|भाई|भैया|दीदी|साहब|आंटी|अंकल|की|के|का|को|ने|से|स्टोर|किराना|दुकान|वाले|वाला)/g

const DEVA: Record<string, string> = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri',
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ट': 't', 'ठ': 'th',
  'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph',
  'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': '', 'ड़': 'r', 'ढ़': 'rh', 'क़': 'k', 'ज़': 'z', 'फ़': 'f',
}

function translitDeva(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFC')) out += DEVA[ch] ?? ch
  return out
}

export function nameKey(name: string): string {
  let s = (name || '').toLowerCase().normalize('NFC').replace(DEVA_HONORIFICS, ' ')
  s = translitDeva(s).replace(HONORIFICS, ' ')
  s = s.replace(/[aeiou]+/g, (m) => m[0]) // collapse vowel length (gupta/guptaa)
  s = s.replace(/w/g, 'v').replace(/(.)\1+/g, '$1')
  return s.replace(/[^a-zঀ-෿]/g, '')
}

export function findByName<T extends { name: string; nameKey: string; archived?: boolean }>(
  items: T[], name: string | null | undefined,
): T | undefined {
  if (!name) return undefined
  const key = nameKey(name)
  if (!key) return undefined
  const live = items.filter((i) => !i.archived)
  return live.find((i) => i.nameKey === key)
    ?? live.find((i) => i.nameKey.includes(key) || key.includes(i.nameKey))
}
