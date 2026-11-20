"""Rule-based number finder for spoken Indian-language money amounts.

Role in the pipeline (deliberately *not* a gate on what the AI may understand):
  1. Annotate the transcript ("साठ [=60]") so the LLM sees the numbers the ASR heard.
  2. Cross-check every amount the LLM returns ("guard"): an amount must be derivable from
     numbers that were actually spoken. If this module cannot read the number words (coverage
     is complete for Hindi/Hinglish, partial for mr/bn/te/ta), the amount is marked
     "unverified" and shown with a check chip -- it is never silently rejected.

Number words are a closed class, so a lexicon is the right tool here; everything open-ended
(items, people, intent, kinds) is left to the LLM.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Lexicons
# ---------------------------------------------------------------------------
_HI_ROMAN = {
    0: "shunya sunya zero", 1: "ek one", 2: "do two", 3: "teen tin three", 4: "chaar char four",
    5: "paanch panch paach five", 6: "chhah chhe che chhai six", 7: "saat sat seven", 8: "aath ath eight",
    9: "nau nine", 10: "das dus ten", 11: "gyarah gyaarah gyara", 12: "barah baarah bara",
    13: "terah tera", 14: "chaudah chauda", 15: "pandrah pandrah pandra", 16: "solah sola",
    17: "satrah satra", 18: "atharah athaarah athara", 19: "unnis unees unnees", 20: "bees bis",
    21: "ikkis ikkees", 22: "bais baais baees", 23: "teis teyis teyees", 24: "chaubis chaubees",
    25: "pachis pachchis pachees pachchees", 26: "chhabbis chabbis chhabbees", 27: "sattais sattaees",
    28: "atthais athais atthaees", 29: "untis untees", 30: "tees tis", 31: "ikattis ikatees iktees",
    32: "battis battees", 33: "taintis taintees tetis", 34: "chautis chauntees chontis",
    35: "paintis paintees", 36: "chhattis chhattees chattis", 37: "saintis saintees",
    38: "adtis adtees aadtees aadtis artees aratees artis", 39: "untalis untaalees untaalis",
    40: "chalis chaalis chaalees chalees", 41: "iktalis iktaalees iktaalis", 42: "bayalis bayaalees bayalees bayaalis",
    43: "taintalis taintaalees tetalis", 44: "chavalis chauvalis chauvaalees chawalis",
    45: "paintalis paintaalees", 46: "chhiyalis chhiyaalees chiyalis", 47: "saintalis saintaalees",
    48: "adtalis artalis artaalees adtaalees", 49: "unchas unchaas", 50: "pachas pachaas pachaas",
    51: "ikyavan ikyaavan", 52: "bavan baavan", 53: "tirpan tirepan", 54: "chauvan chauwan",
    55: "pachpan", 56: "chhappan chappan", 57: "sattavan sattaavan", 58: "atthavan athavan atthaavan",
    59: "unsath unsaath", 60: "saath sath", 61: "iksath iksaath", 62: "basath baasath",
    63: "tirsath tiresath", 64: "chausath chaunsath", 65: "painsath paisath", 66: "chhiyasath chhiyaasath",
    67: "sadsath sarsath", 68: "adsath arsath", 69: "unhattar", 70: "sattar", 71: "ikhattar",
    72: "bahattar", 73: "tihattar", 74: "chauhattar", 75: "pachhattar pachattar", 76: "chhihattar",
    77: "satattar sathattar", 78: "athattar", 79: "unasi unaasi unyasi", 80: "assi",
    81: "ikyasi ikyaasi", 82: "bayasi bayaasi", 83: "tirasi tiraasi", 84: "chaurasi chauraasi",
    85: "pachasi pachaasi", 86: "chhiyasi chhiyaasi", 87: "sattasi sattaasi", 88: "athasi athaasi atthasi",
    89: "navasi navaasi", 90: "nabbe nabe", 91: "ikyanve ikyaanve", 92: "banve baanve",
    93: "tiranve tiraanve", 94: "chauranve chauraanve", 95: "pachanve pachaanve",
    96: "chhiyanve chhiyaanve", 97: "sattanve sattaanve", 98: "atthanve athanve", 99: "ninyanve ninyaanve",
}
_HI_DEVA = {
    0: "शून्य", 1: "एक", 2: "दो", 3: "तीन", 4: "चार", 5: "पांच पाँच", 6: "छह छः छे", 7: "सात", 8: "आठ",
    9: "नौ", 10: "दस", 11: "ग्यारह", 12: "बारह", 13: "तेरह", 14: "चौदह", 15: "पंद्रह पन्द्रह",
    16: "सोलह", 17: "सत्रह", 18: "अठारह", 19: "उन्नीस", 20: "बीस", 21: "इक्कीस", 22: "बाईस",
    23: "तेईस", 24: "चौबीस", 25: "पच्चीस", 26: "छब्बीस", 27: "सत्ताईस", 28: "अट्ठाईस", 29: "उनतीस",
    30: "तीस", 31: "इकतीस", 32: "बत्तीस", 33: "तैंतीस", 34: "चौंतीस", 35: "पैंतीस", 36: "छत्तीस",
    37: "सैंतीस", 38: "अड़तीस अडतीस", 39: "उनतालीस", 40: "चालीस", 41: "इकतालीस", 42: "बयालीस",
    43: "तैंतालीस", 44: "चवालीस चौवालीस", 45: "पैंतालीस", 46: "छियालीस", 47: "सैंतालीस",
    48: "अड़तालीस अडतालीस", 49: "उनचास", 50: "पचास", 51: "इक्यावन", 52: "बावन", 53: "तिरपन तिरेपन",
    54: "चौवन", 55: "पचपन", 56: "छप्पन", 57: "सत्तावन", 58: "अट्ठावन", 59: "उनसठ", 60: "साठ",
    61: "इकसठ", 62: "बासठ", 63: "तिरसठ तिरेसठ", 64: "चौंसठ चौसठ", 65: "पैंसठ", 66: "छियासठ",
    67: "सड़सठ सडसठ", 68: "अड़सठ अडसठ", 69: "उनहत्तर", 70: "सत्तर", 71: "इकहत्तर", 72: "बहत्तर",
    73: "तिहत्तर", 74: "चौहत्तर", 75: "पचहत्तर", 76: "छिहत्तर", 77: "सतहत्तर", 78: "अठहत्तर",
    79: "उन्यासी उनासी", 80: "अस्सी", 81: "इक्यासी", 82: "बयासी", 83: "तिरासी", 84: "चौरासी",
    85: "पचासी", 86: "छियासी", 87: "सत्तासी", 88: "अट्ठासी", 89: "नवासी", 90: "नब्बे",
    91: "इक्यानवे", 92: "बानवे", 93: "तिरानवे", 94: "चौरानवे", 95: "पचानवे", 96: "छियानवे",
    97: "सत्तानवे", 98: "अट्ठानवे", 99: "निन्यानवे",
}
_EN = {11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen", 17: "seventeen",
       18: "eighteen", 19: "nineteen", 20: "twenty", 30: "thirty", 40: "forty fourty", 50: "fifty", 60: "sixty",
       70: "seventy", 80: "eighty", 90: "ninety"}
_EN_TENS = {"twenty", "thirty", "forty", "fourty", "fifty", "sixty", "seventy", "eighty", "ninety"}
# Partial lexicons (units, teens/tens). Compound words not listed fall back to "unverified".
_MR = {1: "एक", 2: "दोन", 3: "तीन", 4: "चार", 5: "पाच", 6: "सहा", 7: "सात", 8: "आठ", 9: "नऊ", 10: "दहा",
       11: "अकरा", 12: "बारा", 13: "तेरा", 14: "चौदा", 15: "पंधरा", 16: "सोळा", 17: "सतरा", 18: "अठरा",
       19: "एकोणीस", 20: "वीस", 25: "पंचवीस", 30: "तीस", 40: "चाळीस", 50: "पन्नास", 60: "साठ",
       70: "सत्तर", 80: "ऐंशी", 90: "नव्वद"}
_BN = {1: "এক", 2: "দুই দু", 3: "তিন", 4: "চার", 5: "পাঁচ", 6: "ছয়", 7: "সাত", 8: "আট", 9: "নয়", 10: "দশ",
       11: "এগারো", 12: "বারো", 13: "তেরো", 14: "চোদ্দ", 15: "পনেরো", 16: "ষোলো", 17: "সতেরো", 18: "আঠারো",
       19: "উনিশ", 20: "কুড়ি বিশ", 25: "পঁচিশ", 30: "তিরিশ ত্রিশ", 40: "চল্লিশ", 50: "পঞ্চাশ", 60: "ষাট",
       70: "সত্তর", 80: "আশি", 90: "নব্বই"}
_TE = {1: "ఒకటి ఒక", 2: "రెండు", 3: "మూడు", 4: "నాలుగు", 5: "ఐదు అయిదు", 6: "ఆరు", 7: "ఏడు", 8: "ఎనిమిది",
       9: "తొమ్మిది", 10: "పది", 20: "ఇరవై", 30: "ముప్పై", 40: "నలభై", 50: "యాభై", 60: "అరవై", 70: "డెబ్బై",
       80: "ఎనభై", 90: "తొంభై"}
_TA = {1: "ஒன்று ஒரு", 2: "இரண்டு", 3: "மூன்று", 4: "நான்கு", 5: "ஐந்து", 6: "ஆறு", 7: "ஏழு", 8: "எட்டு",
       9: "ஒன்பது", 10: "பத்து", 20: "இருபது", 30: "முப்பது", 40: "நாற்பது", 50: "ஐம்பது", 60: "அறுபது",
       70: "எழுபது", 80: "எண்பது", 90: "தொண்ணூறு"}
# Whole-word hundreds (added to the running group like "do sau").
_HUNDREDS_WORDS = {
    "शंभर": 100, "एकशे": 100, "দুশো": 200, "একশো": 100, "শো": 100,
    "நூறு": 100, "இருநூறு": 200, "முந்நூறு": 300, "நானூறு": 400, "ஐநூறு": 500, "அறுநூறு": 600,
    "எழுநூறு": 700, "எண்ணூறு": 800, "தொள்ளாயிரம்": 900,
}
_MULTIPLIERS = {
    # "सो": ASR often drops the nasal of "सौ" (seen in the local Whisper benchmark)
    "sau": 100, "so": 100, "hundred": 100, "सौ": 100, "सो": 100, "शे": 100, "वंद": 100, "వంద": 100, "వందల": 100,
    "వందలు": 100, "hazaar": 1000, "hazar": 1000, "hajaar": 1000, "thousand": 1000, "हज़ार": 1000,
    "हजार": 1000, "হাজার": 1000, "వెయ్యి": 1000, "వేయి": 1000, "వేల": 1000, "వేలు": 1000,
    "ஆயிரம்": 1000, "ஆயிரத்து": 1000, "lakh": 100000, "lac": 100000, "लाख": 100000, "লাখ": 100000,
    "লক্ষ": 100000, "లక్ష": 100000, "லட்சம்": 100000, "crore": 10_000_000, "करोड़": 10_000_000,
}
# Value-like fractions and prefix modifiers.
_FRACTION_VALUES = {"dedh": 1.5, "derh": 1.5, "डेढ़": 1.5, "डेढ": 1.5, "dhai": 2.5, "dhaai": 2.5, "ढाई": 2.5,
                    "adhai": 2.5, "अढ़ाई": 2.5, "aadha": 0.5, "आधा": 0.5, "দেড়": 1.5, "আড়াই": 2.5}
_MODIFIERS = {"saade": 0.5, "sade": 0.5, "saadhe": 0.5, "sadhe": 0.5, "साढ़े": 0.5, "साढे": 0.5, "সাড়ে": 0.5,
              "sava": 0.25, "sawa": 0.25, "सवा": 0.25, "সোয়া": 0.25, "paune": -0.25, "pone": -0.25,
              "पौने": -0.25, "পৌনে": -0.25}
_MR_HUNDRED_SUFFIX = "शे"      # दोनशे = 200
_BN_HUNDRED_SUFFIX = "শো"      # তিনশো = 300
_BN_PREFIX = {"এক": 1, "দু": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "ছ": 6, "সাত": 7, "আট": 8, "ন": 9}

_VALUES: dict[str, float] = {}
for table in (_HI_ROMAN, _HI_DEVA, _EN, _MR, _BN, _TE, _TA):
    for value, words in table.items():
        for w in words.split():
            if w in _VALUES and _VALUES[w] != float(value):
                raise ValueError(f"number word {w!r} mapped to both {_VALUES[w]} and {value}")  # caught the 'tees' bug
            _VALUES[w] = float(value)
# "do" is also a verb ("de do"); it still counts as a number candidate. That only widens the
# guard's accepted set slightly; it can never create an amount on its own.

_NATIVE_DIGITS = {}
for base in (0x0966, 0x09E6, 0x0C66, 0x0BE6, 0x0AE6, 0x0CE6, 0x0D66):  # deva, beng, telu, taml, gujr, knda, mlym
    for i in range(10):
        _NATIVE_DIGITS[chr(base + i)] = str(i)
_DIGIT_TRANS = str.maketrans(_NATIVE_DIGITS)

_TOKEN_RE = re.compile(r"[0-9]+(?:[.,][0-9]+)*|[a-zऀ-ॣ०-෿‌‍]+")


def normalize_text(text: str) -> str:
    """NFC, lowercase, native digits -> ASCII, separate digits from letters, collapse spaces."""
    t = unicodedata.normalize("NFC", text or "").lower().translate(_DIGIT_TRANS)
    t = t.replace("₹", " ₹ ")
    t = re.sub(r"(?<=\d)(?=[^\d\s.,])", " ", t)
    t = re.sub(r"(?<=[^\d\s.,₹])(?=\d)", " ", t)
    return re.sub(r"\s+", " ", t).strip()


@dataclass
class NumberHit:
    value: float
    start: int
    end: int
    text: str


def _word_value(tok: str) -> float | None:
    if tok in _VALUES:
        return _VALUES[tok]
    return None


def find_numbers(text: str) -> list[NumberHit]:
    """Find spoken/written numbers in already-normalised text."""
    hits: list[NumberHit] = []
    total = 0.0
    current = 0.0
    pending: float | None = None
    modifier: float | None = None
    group_start: int | None = None
    group_end = 0
    last_was_multiplier = False

    def close() -> None:
        nonlocal total, current, pending, modifier, group_start, last_was_multiplier
        if group_start is not None:
            value = total + current + (pending or 0.0)
            hits.append(NumberHit(value, group_start, group_end, text[group_start:group_end]))
        total, current, pending, modifier, group_start, last_was_multiplier = 0.0, 0.0, None, None, None, False

    last_tok = ""
    for m in _TOKEN_RE.finditer(text):
        tok, s, e = m.group(0), m.start(), m.end()
        prev_tok, last_tok = last_tok, tok   # previous token, for English "twenty five"
        # Plain digits ("420", "4,200", "1.5")
        if tok[0].isdigit():
            try:
                v = float(tok.replace(",", ""))
            except ValueError:
                close()
                continue
            if group_start is not None and last_was_multiplier and pending is None and v < 1000:
                pending, group_end, last_was_multiplier = v, e, False
                continue
            if group_start is not None and pending is not None:
                close()
            if group_start is None:
                group_start = s
            pending, group_end, last_was_multiplier = v, e, False
            continue

        if tok in _MODIFIERS:
            if group_start is not None and pending is not None:
                close()
            modifier = _MODIFIERS[tok]
            if group_start is None:
                group_start = s
            group_end = e
            continue

        v = _word_value(tok)
        if v is None and tok in _FRACTION_VALUES:
            v = _FRACTION_VALUES[tok]
        if v is not None:
            if modifier is not None:
                v, modifier = v + modifier, None
            # English compounds: "twenty five" / "twenty-five" -> 25
            if pending is not None and prev_tok in _EN_TENS and 1 <= v <= 9:
                pending, group_end = pending + v, e
                continue
            if group_start is not None and pending is not None:
                close()
            if group_start is None:
                group_start = s
            pending, group_end, last_was_multiplier = v, e, False
            continue

        hundreds = _HUNDREDS_WORDS.get(tok)
        if hundreds is None and tok.endswith(_MR_HUNDRED_SUFFIX) and tok[: -len(_MR_HUNDRED_SUFFIX)] in _VALUES:
            hundreds = _VALUES[tok[: -len(_MR_HUNDRED_SUFFIX)]] * 100
        if hundreds is None and tok.endswith(_BN_HUNDRED_SUFFIX) and tok[: -len(_BN_HUNDRED_SUFFIX)] in _BN_PREFIX:
            hundreds = _BN_PREFIX[tok[: -len(_BN_HUNDRED_SUFFIX)]] * 100.0
        if hundreds is not None:
            if group_start is None:
                group_start = s
            if pending is not None:
                close()
                group_start = s
            current += hundreds
            group_end, last_was_multiplier = e, True
            continue

        mult = _MULTIPLIERS.get(tok)
        if mult is not None:
            if group_start is None:
                group_start = s
            base = pending
            if base is None and modifier is not None:
                base, modifier = 1 + modifier, None
            if mult == 100:
                current += (base if base is not None else 1.0) * 100
            else:
                b = current + (base or 0.0)
                total += (b if b else 1.0) * mult
                current = 0.0
            pending, group_end, last_was_multiplier = None, e, True
            continue

        close()
    close()
    # A lone modifier with no number is not a number.
    return [h for h in hits if not (h.value == 0 and h.text.strip() in _MODIFIERS)]


def annotate(transcript: str) -> tuple[str, list[NumberHit]]:
    """Return normalised transcript with "[=value]" after each detected number, and the hits."""
    norm = normalize_text(transcript)
    hits = find_numbers(norm)
    out, last = [], 0
    for h in hits:
        out.append(norm[last:h.end])
        out.append(f" [={_fmt(h.value)}]")
        last = h.end
    out.append(norm[last:])
    return "".join(out), hits


def _fmt(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v)


# ---------------------------------------------------------------------------
# Guard
# ---------------------------------------------------------------------------
PARTIAL_COVERAGE_LANGS = {"mr", "bn", "te", "ta"}
_PARTIAL_SCRIPT_RE = re.compile(r"[ঀ-৿઀-૿஀-௿ఀ-ൿ]")


def _partial_coverage(span: str, lang: str | None) -> bool:
    """True when the number lexicon cannot be assumed complete for this span."""
    if lang in PARTIAL_COVERAGE_LANGS:
        return True
    return bool(_PARTIAL_SCRIPT_RE.search(span))  # bn/gu/ta/te/kn/ml script, whatever the setting


def check_amount(amount: float | None, amount_span: str | None, transcript: str,
                 hits: list[NumberHit] | None = None, lang: str | None = None) -> str:
    """Classify an LLM-returned amount against what was spoken.

    Returns one of:
      "none"          no amount
      "derived"       equals a spoken number (or a sum/product of two spoken numbers)
      "unverified"    the span is in the transcript but is in a language whose number words this
                      module only partly covers -> keep, but show a "please check" chip
      "not_in_speech" cannot be derived from speech -> the caller must drop it and ask
    """
    if amount is None:
        return "none"
    norm = normalize_text(transcript)
    hits = hits if hits is not None else find_numbers(norm)
    values = [h.value for h in hits]
    if any(abs(v - amount) < 1e-6 for v in values):
        return "derived"
    for i, a in enumerate(values):
        for b in values[i + 1:]:
            if abs(a + b - amount) < 1e-6 or abs(a * b - amount) < 1e-6:
                return "derived"
    if amount_span:
        span = normalize_text(amount_span)
        if span and span in norm:
            span_hits = find_numbers(span)
            if not span_hits:
                return "unverified" if _partial_coverage(span, lang) else "not_in_speech"
            if any(abs(h.value - amount) < 1e-6 for h in span_hits):
                return "derived"
    return "not_in_speech"
