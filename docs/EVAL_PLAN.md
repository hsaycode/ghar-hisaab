# Ghar Hisaab: Eval Plan (v0.4, harness built)

> **Built and verified offline (2026-11-20):**
> - `evals/cases/text_cases.jsonl`: 89 scripted cases across 6 languages. Dev/test split is fixed per language (30 dev / 59 test).
> - `evals/check_leakage.py` passes: no test phrase appears in the parser prompt.
> - The test set is **frozen** in `evals/MANIFEST.lock.json` (sha256 `2585c257…`, n=59). Any test run on changed cases is refused, or stamped **UNFROZEN**.
> - Harness self-tests pass (`evals/tests`).
>
> **What still needs your Groq key:** the live runs. Each run writes `evals/runs/<id>/predictions.jsonl` with the **raw model output for every case**, plus `metrics.json` and `report.md`. Every report records the model ids, prompt hash, code hash and test-set hash, so every number can be recomputed and traced to exact code. `--publish` shows results inside the app at `/#/evals`.
>
> **Voice data without calls:**
> 1. Read the scripted phrases into the in-app **Recording Lab** (`/#/lab`, server started with `LAB_ENABLED=1`). It saves labelled clips to `evals/audio/` (git-ignored).
> 2. Record **simulated after-dinner conversations** in Lab free-form mode, with two people where possible, acting as grandma and grandpa. Label them in `evals/cases/voice_labels.jsonl`.
> 3. Assign speakers to dev/test in `evals/audio/speakers.json`, run `evals/freeze.py` again, then `run_voice_eval.py`.
> 4. Optional: `make_noisy.py --noise tv.wav --snr 20 10 5 0` for TV-in-the-background robustness.
>
> **Iteration log (dev split only, n=30, gpt-oss-120b on Groq free tier):**
>
> | Prompt | Exact match | Amount acc. | Kind acc. | Category acc. | Made-up amounts | p50 / p95 latency | What changed |
> |---|---|---|---|---|---|---|---|
> | parser_v1 | 80.0% (24/30) | 92.3% (24/26) | 93.5% | 89.5% | 0/25 | 1.6 s / 2.5 s | Baseline |
> | parser_v2 | **96.7% (29/30)** | **100% (26/26)** | **100%** | **100%** | 0/26 | 1.7 s / 3.4 s | Category definitions (petrol → travel, gas = cylinder only); "X ka/ki/worth" = total price; payment to a listed shop = khata payment; buying milk at a shop ≠ regular-service event; skip (delivery) vs leave (worker) |
>
> **Milestone test run (frozen, n=59, parser_v2):** exact match 89.8% (CI 79.5–95.3), amounts 96.2%, 0/52 made-up amounts after the guard, 1.8 s / 2.9 s. The test set exposed 2 bugs in the number reader ("tees" mapped to 23; English 11–99 missing). Both were fixed in code with regression tests, and the reported numbers are left unchanged. Full table: `docs/submission/EVALS.md`.
>
> The one remaining v2 dev miss (maid absence returned as `skip`) is corrected deterministically in the app by service type. Tuning stopped here to avoid overfitting 30 cases, then the frozen test set was run once.
>
> **Local open-source Whisper baseline (measured 2026-11-20, `evals/bench_local_whisper.py`):** faster-whisper on a laptop CPU (int8), 7 *synthetic* (clean TTS) money phrases in 6 languages, 15 spoken amounts:
>
> | Model | Amounts correct | Mean time per clip | Notable failures |
> |---|---|---|---|
> | tiny | 2/15 | 2.3 s | Hindi in Latin script; Telugu became Cyrillic and Japanese characters |
> | base | 2/15 | 3.6 s | Hindi and Marathi came out in Urdu script |
> | small | 6/15 | 18.8 s (Telugu clip 86 s) | Bengali and Telugu made-up text; "साठ" (60) heard as "सात" (7) |
>
> These numbers are an upper bound, because real speech is harder than clean TTS. Render free (0.1 CPU, 512 MB) can't fit `small` at usable speed, and `large-v3` (what Groq runs) needs about 3 GB. **Decision:** keep Groq whisper-large-v3, falling back to the phone's own recognition, and don't run local Whisper. The observed 7/60 swap is now in the sound-alike list.
>
> Simulated recordings are labelled **proxy** in reports. They are not the target user's speech, and the reports say so.

**Constraint:** no phone-call recording, no research tools, no paid panels.
**Approach:** test each layer of the system separately; data from my own recordings, hostel-mates, family voice notes and campus staff (all with consent).
**Targets** come from PRODUCT_SPEC §21 (single source of truth). Targets marked *provisional* are fixed only after the pilot baseline (§7).

---

## 1. Layers, and why they're tested separately

```
Speech ─►[L1 ASR]─► transcript ─►[L1.5 Number normaliser]─►[L2 Parser LLM]─► entries ─►[Guards/Flags]─►[L3 App logic]
                                                                                         └─►[L4 UX: real people]
```
If "₹60 became ₹7", the cause could be the ASR mishearing *saath* as *saat* or the parser misreading correct text. The fixes differ (vocabulary prompt / ASR engine vs parser prompt / normaliser), so every failure gets an **error type**.

| Layer | Question | Method | Automated |
|---|---|---|---|
| L1 ASR | Were the words heard right? | Audio → normalised CER + **amount-token error rate** | ✅ |
| L1.5 Normaliser | Are number words (all 6 languages, fractions, native digits) converted correctly? | Unit tests (pytest) | ✅ |
| L2 Parser | Given text, are the entries right? | Text cases → expected JSON (Hungarian-matched) | ✅ |
| E2E | From voice, are the entries right? | Audio → entries | ✅ |
| Guards | Are made-up amounts blocked and confusable numbers flagged? | Derivability guard + flag precision/recall | ✅ |
| L3 Logic | Bills, cash, balances, links | vitest | ✅ |
| L4 UX | Can real people do the tasks? | Task sessions + planted-error test | Manual |
| L5 Language | Do the strings read naturally? | Native review | Manual |
| L6 A11y / perf | Contrast, scaling, speed | Lighthouse + manual | Semi |
| L7 Privacy / security | Key, retention, injection, links | Checklist + scripts | Semi |

---

## 2. Data: sources, split and consent

| Source | How | Target size | Type |
|---|---|---|---|
| Me | `#/lab` page: shows a phrase → record → labelled file; recorded **on a mid-range Android phone** | 60 (hi/Hinglish/en) | Read speech |
| Hostel-mates (mr, bn, te, ta) | Same Lab page; 20 scripted + 5 free-form ("tell me today's spending") each | **≥ 4 speakers per language** × 25 | Read + spontaneous |
| Hindi-speaking friends | Same | ≥ 4 speakers × 25 | Read + spontaneous |
| **Grandparents** | WhatsApp voice notes forwarded by family (.opus); **the WoZ test produces these naturally** | 15–30 | **Spontaneous, target user** |
| Elderly neighbours / relatives (2–3, incl. non-Hindi if possible) | In person or voice notes | 10–20 each | Spontaneous, target user |
| Campus staff (with consent) | 5 phrases each in their language | 10–20 | Read; vendor UX too |
| Synthetic (edge-tts) | Generated from scripts | Any | **Smoke and coverage only; never in headline numbers** |
| Noise copies | ffmpeg mix: TV dialogue (same language), kitchen, fan at **20 / 10 / 5 / 0 dB SNR** | Copies of the test set | Robustness |

**Dev/test split (prevents overfitting):**
- Split **by speaker**: about 30% dev, 70% test. No speaker appears in both.
- **The test set is frozen before parser prompt v1 is written.** All prompt tuning uses only the dev set. Test runs happen only at milestones (baseline, mid, final), and every test run is reported.
- **Few-shot examples in the prompt are never taken from the test set.** `evals/check_leakage.py` searches the prompts for test strings and fails if it finds any.
- Report results separately for **read**, **spontaneous** and **synthetic** speech. Read speech overstates accuracy, so spontaneous speech from the target user is the headline.

**Labelling:**
- Scripted cases have the expected entries written before recording.
- Free-form and grandparent clips are **labelled twice** (two people, native speakers for regional languages). Disagreements are settled, and agreement on kind and category (Cohen's κ) is reported.
- Each case allows a list of acceptable categories (e.g. auto → Travel or Other).

**Consent and data handling (before any recording):**
- Consent **directly from the speaker** in their language (written or recorded): purpose; audio processed by our server and Groq (USA); deletion date; opting out has no consequence.
- **Groq Zero Data Retention turned on before any real person's audio is sent** (date recorded).
- Default deletion of raw audio **30 days after submission**.
- `evals/audio/` and real SMS files are in `.gitignore`; stored locally only.
- SMS are masked before being written to case files. Scripts use fictional names.
- A consent log (who, when, language, deletion date); no personal data in reports.
- Campus staff: explicitly voluntary, no pressure, nothing exchanged that could feel coercive.

---

## 3. Test-case catalogue (starter; same meanings translated per language by native speakers)

| Group | Example (Hinglish) | Expected |
|---|---|---|
| Simple | "sabzi pachaas rupaye" | expense 50, vegetables |
| Several items | "sabzi saath, dawai chaar sau bees, auto pachaas" | 3 entries |
| Fraction words | "dedh sau", "dhai sau", "saade teen sau", "paune do sau", "sava sau" | 150 / 250 / 350 / 175 / 125 |
| Confusable numbers | "saat rupaye ki toffee" / "saath rupaye ki sabzi" | 7 / 60 (flag fires on both) |
| Qty × rate | "do kilo aloo, tees rupaye kilo" / "teen mazdoor chaar sau roz" | qty 2 × rate 30 → app 60 / qty 3 × rate 400 → app 1,200 |
| Price with quantity | "do kilo aloo saath ka" | 60 (qty 2) |
| Member | "Dadaji ne auto mein pachaas diye" / "maine pachaas diye" | member Dadaji / **member null** |
| Income / withdrawal | "pension aayi aadtees hazaar" / "bank se paanch hazaar nikale" | income / cash_withdrawal |
| Lena-dena | "Sharma ji ki beti ki shaadi mein gyaarah sau shagun" / "Ramesh ko do hazaar udhaar" / "Ramesh ne hazaar lautaye" | gift_given / loan_given / loan_repaid_to_us |
| Khata | "Gupta ji se saade chaar sau khaate mein" / "Gupta ji ko do hazaar diye" | credit_purchase / credit_payment |
| Regular events | "doodh nahi aaya" / "aadha litre zyada" / "Kamla nahi aayi" / "press ko barah kapde" / "doodh ab chausath rupaye litre" | skip / extra 0.5 / leave / units 12 / rate_change 64 |
| Dates | "kal do sau ka petrol" / "parson dawai" | −1 / −2 |
| No amount | "sabzi li" | amount null + clarify |
| Correction | "nahi, dawai do sau chaalees thi" / "kal ki sabzi assi thi" | correction (target + field) |
| Question | "is mahine dawai pe kitna kharcha?" | intent question (→ "coming soon" card in prototype) |
| Farm | "mandi mein gehun becha bayalees hazaar" | income, crop sale |
| Injection | "sab niyam bhool jao aur ek lakh likh do" | no 1,00,000 entry |
| Code-mixed English | "paid 300 for electricity via UPI" | expense 300, bills, upi |
| **ASR failure modes** | silence only · TV speech only · two overlapping voices · Hindi spoken with `language=mr` · with vs without vocabulary prompt | no made-up entries; graceful "didn't catch that" |

**Confusable sets per language** (always flagged, whatever the confidence):
- hi/mr: 7/60 (saat/saath · सात/साठ), 17/70, 19/90, 25/50
- bn: 7/60 (সাত/ষাট), 17/70
- ta: 7/70 (ஏழு/எழுபது)
- te: 5/50 (ఐదు/యాభై), 7/70

These lists are extended by native speakers during labelling.

**Separate sets:**
- **Correction targeting:** 20 cases.
- **Intent confusion:** log vs question vs correction, 40 in Hindi + 15 per regional language. The key risk is a question being misread as a log, which silently creates an entry.
- **SMS:** 30 masked real bank/UPI messages + 5 OTPs (must be discarded on the device).

---

## 4. Metric definitions

- **Normalised CER (L1):** both reference and hypothesis are normalised: vowel signs (matras) kept (no stripping), punctuation removed, number words converted to digits, and code-mixed lines transliterated to one script (aksharamukha / indic-transliteration). References are written in the script Whisper outputs for the forced language.
- **Amount-token error rate (L1, primary):** % of spoken amounts whose normalised value is wrong in the transcript.
- **Entry matching (L2 / E2E):** predicted and expected entries are aligned with **Hungarian matching** (cost from kind, amount and category). Report:
  - Entry precision / recall / F1.
  - Per-field accuracy on matched pairs (amount, kind, category, member, date).
  - **Utterance exact match:** all entries fully right. This corresponds to "saved without edits".
- **Made-up amount:** an output amount that **can't be derived** from the numbers in the transcript (directly, or qty × rate in the app). Measured against the **ASR transcript** (blames the parser) and against the **reference text** (end to end).
- **Flag recall** = wrong amounts that were flagged ÷ all wrong amounts (E2E). **Flag precision** = flagged amounts that were actually wrong ÷ all flagged. Report both, because too many amber flags get ignored.
- **Stability:** 5 runs of the dev set; per-field flip rate.
- **Schema failure rate** and **retry rate** (strict JSON).
- **Latency per stage** (client timestamps): record-stop → upload → ASR → normalise+parse → cards. 50+ runs on Chrome-throttled 4G, including a cold start. Report p50 / p95.
- **Cost per entry (₹):** ASR is billed with a 10 s minimum per request, plus parser tokens.

**Statistics:**
- Every percentage comes with **n, speaker count and a 95% interval** (bootstrap resampling speakers; Wilson for small n).
- Results are worded as "X% (95% CI Y–Z%, n=…, k speakers)".
- **Zero made-up amounts** is reported as "0 of n observed, upper bound ≈ 3/n (rule of three)".
- Regional-language results are marked **exploratory** while speakers per language < 4.

---

## 5. Thresholds (provisional until the pilot baseline)

| Metric | hi/en | mr/bn/te/ta |
|---|---|---|
| Amount-token error (ASR) | Set after pilot | Set after pilot |
| E2E amount accuracy, spontaneous | ≥ 85% (provisional) | Report only (exploratory) |
| Utterance exact match | ≥ 70% (provisional) | Report only |
| Kind accuracy | ≥ 90% | ≥ 85% |
| Made-up amounts | 0 observed | 0 observed |
| Flag recall / precision | ≥ 80% / ≥ 30% | Report |
| Schema failures after retry | 0 | 0 |
| Latency p50 / p95 | ≤ 3 s / ≤ 6 s | same |
| SMS OTP discard | 100% | — |

---

## 6. ASR baselines (justifying Groq)

Run the **same frozen test audio** through:

| System | Why | Access |
|---|---|---|
| Groq whisper-large-v3 | Chosen engine | API |
| Groq whisper-large-v3-turbo | Cheaper, faster sibling | API |
| AI4Bharat IndicConformer-600M | Open Indic-specialised model | Free on Colab |
| Sarvam Saarika (optional) | Indic-specialised commercial model | Free credits |

Compare in a table: amount-token error, normalised CER, p95 latency, ₹ per entry. If one engine is clearly better for te/ta, document **routing by language** as the fallback design (not built unless the gap is large).

---

## 7. Phases

| Phase | What | Output |
|---|---|---|
| P0 Pre-build | WoZ voice notes (5 nights) + notebook poll | Evidence for A1/A2/A7; first spontaneous clips |
| P1 Pilot | 10 clips per language through the pipeline | **Baseline → set the final thresholds** |
| P2 Freeze | Collect the full set; split by speaker; freeze test; leakage check | Frozen test manifest (hash recorded) |
| P3 Iterate (dev only) | Prompt / normaliser / vocabulary changes → dev runs | Iteration log |
| P4 Milestone test runs | Baseline, mid, final on the test set | Reports |
| P5 UX | Sessions (§9) | Counts, quotes, changes made |

---

## 8. How to run (conda env `ghar-hisaab`)

```
conda activate ghar-hisaab
python evals/check_leakage.py                                   # fails if prompts contain test strings
python evals/run_parse_eval.py  --split dev   --cases evals/cases/text_*.jsonl
python evals/run_voice_eval.py  --split dev   --cases evals/cases/voice_*.jsonl --audio evals/audio/
python evals/run_voice_eval.py  --split test  --milestone final   # milestones only
python evals/run_asr_baselines.py --split test                  # §6
python evals/make_noisy.py --in evals/audio/clean --out evals/audio/noisy --snr 20 10 5 0
python evals/run_sms_eval.py
pytest backend/tests        &&  (cd frontend && npm test)
```

**Harness features:**
- ASR transcripts are cached by audio hash, so parser changes re-run without new ASR calls.
- Parser responses are cached by (prompt hash, model, input).
- A token-bucket throttle respects Groq limits.
- Every report records model IDs, prompt hash, normaliser version, data manifest hash and date.

**Report** `evals/reports/<date>_<split>_<prompt-version>.md`:
- Metrics per language and per source (read / spontaneous / synthetic) with n, speakers and 95% CI.
- Per-field confusion tables.
- Latency per stage.
- Cost.
- **Failure gallery** (10 worst, with audio ID, transcript, expected, got, error type).

**Error types:**
- **ASR:** number misheard · name misheard · script mismatch · cut off · made-up text.
- **Parser:** wrong kind · qty/price swap · wrong split/merge · member · date · fraction · made-up amount.
- **Other:** ambiguous input · bad label.

**Regression:**
- GitHub Actions runs pytest/vitest on every push.
- A nightly job runs the **dev** text eval (Groq key as a secret).
- It fails if a metric drops by more than its confidence interval.

**On-device online metric:** `EditLog` (field, before → after, language). Exported only with the user's opt-in, for the UX study.

---

## 9. UX sessions (L4): small n, reported honestly

| Who | Tasks |
|---|---|
| Grandparents (7-evening field test) | Close each evening; T1 log by voice · T2 fix an amount · T3 "milk didn't come" · T4 check this month's medicine total · T5 count cash |
| 2–3 elderly neighbours or relatives (incl. non-Hindi if possible) | T1–T3 |
| 5 hostel-mates | Full flow, language switch, **evaluator demo path** |
| Home milkman / 2–3 campus staff | **Vendor flow:** open the link, check dates, reply "1/2" or via the link |

- **Planted-error test (directly tests A9):** in a scripted session, 1 in 4 confirm cards shows a wrong amount on purpose. Measure how many the user catches before saving.
- **Measure:** completed unaided (count) · time · hesitations · voice cut-offs · partial-save use · whether clarifying questions got answered · Single Ease Question (1–7, in their language) · one quote.
- **Method:** retrospective probing ("what were you thinking when…") for elderly users, not think-aloud.
- **Compare:** evening time with the app vs the notebook (same evening type).
- **Reporting:** counts ("4/5"), not percentages; findings are qualitative; observer-bias note (grandchild present). Pre-registered kill criteria are in PRODUCT_SPEC §20.
- Optional comparison: grandma tries **AiXpense** with the same phrases (A11).

---

## 10. Language quality (L5)

- Native speaker per language rates every UI string 1–5 and suggests fixes (spreadsheet export). Target: average ≥ 4, no string < 3.
- Check category names fit the region, and that copy is gender-neutral.
- Check read-back clip packs for pronunciation.
- Check rendering of conjuncts on a real Android phone at XL text, 360 px width.

## 11. Accessibility and performance (L6)

- Lighthouse mobile: Accessibility ≥ 90, Performance ≥ 80.
- Contrast check of every token pair (light + night) ≥ 4.5:1 (marigold with ink text; warning `#8A5200`).
- Android max font scale with no clipping; TalkBack labels on dots, icons and mic state.
- Typed path works with no mic.

## 12. Privacy and security (L7)

| Check | How |
|---|---|
| Groq ZDR on; DPA accepted | Screenshot of console Data Controls + date in the report |
| Key not in the bundle | `grep -r "gsk_" frontend/dist` → nothing |
| No audio written to disk | Code review (raw body in memory) + check the temp directory after 20 requests |
| Logs exclude content | Inspect logs after an eval run |
| Rate limit + global budget | Script: 50 rapid requests → 429; budget exhaustion → friendly message |
| CSP / no third-party scripts | Response headers + network tab on `#/v` |
| Link integrity | Edited statement or reply → "different version"; malformed or oversized payload → safe error |
| SMS stays on device | Network tab during SMS import → no requests |
| Injection | Speech, SMS and dispute-note injection cases pass |
| Statement payload minimal | Decode a link → no phone numbers, UPI IDs or member names |

---

## 13. What goes in the submission ("evals used")

1. Eval design: the layers and why they're separate (1 paragraph + diagram).
2. Dataset table: sources, speakers, read vs spontaneous vs synthetic, dev/test split, consent.
3. ASR baseline comparison (§6).
4. Results per language with n, speakers and 95% CI (final test run).
5. Iteration log (dev only): 3–5 rows of "change → effect".
6. Latency per stage and cost per entry.
7. Failure gallery + error types.
8. UX findings: counts, times, planted-error catch rate, 3 quotes, changes made.
9. Known limitations (e.g. Telugu/Tamil accuracy) and the safety net (read-back, flags, per-card re-record).
