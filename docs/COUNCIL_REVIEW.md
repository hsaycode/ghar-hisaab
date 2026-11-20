# Council Review: Decision Log (spec v0.2 → v0.3)

Five independent reviewers each read PRODUCT_SPEC v0.2 and EVAL_PLAN v0.2 from one angle and researched gaps: **Groww PM / case evaluator**, **UX for elderly, low-literacy, multilingual users**, **Staff engineer**, **Privacy, legal and trust**, **AI eval lead**. This log records what was found, how conflicts were resolved, and where each fix now lives.

## Conflicts and how they were resolved

| Conflict | Positions | Resolution |
|---|---|---|
| Scope | PM: cut to the core loop in Hindi/English. Eng: cut SMS, farm, Ask, payment round trip, but keep 6 speech languages (cheap). User explicitly asked for all trackers, regional languages, SMS opt-in, vendor flow, farm. | **Three tiers** (spec §7). Tier 1 = the demo-critical core loop, built and polished first. Tier 2 = what the user asked for, built after Tier 1 is stable. Tier 3 = designed, not built, with reasons (Ask your hisaab, payment round trip, share target, signed links, child view, native SMS). |
| Silence auto-stop | UX: 5–6 s. Eng: 3.5–4 s. | 4 s by default, **6 s in evening / slow-speaker mode**, plus "Done" and "Say more" buttons and a 90 s cap. |
| Vendor link security | Privacy: Ed25519 signing now. Eng: hashes now, signing on the roadmap. | **sid + SHA-256 hash binding, replies with no amounts, the household's copy is the source of truth, expiry, size caps.** Signing moves to Tier 3. A UPI ID is never taken from a link. |
| Read-back | UX: pre-recorded clips. Eng: probe speechSynthesis voices. | **Pre-generated neural-TTS clip packs stitched on the device** (offline, consistent). speechSynthesis only for free text after a setup check. |
| SMS parsing | Spec v0.2 said "stays on phone" but had an AI fallback. | **Rule-based on the device only, no network** in the prototype, so the consent text is true. |

## Findings by area → where fixed

| Area | Key findings | Fixed in |
|---|---|---|
| Evidence honesty | n=1 labelled "verified"; J2 stated as fact; kill criteria too weak; basics unchecked | Spec §1, §20 (labels "observed (n=1)", A16, pre-registered kill criteria, WoZ test, notebook poll) |
| Metric fit | "≥1 entry/day" doesn't measure the evening ritual | Spec §21: main metric = **evenings closed** ("Done for today") |
| Missing PM sections | Adoption and distribution, JTBD, why now, viability, Groww relevance, submission map, prompt logging | Spec §0, §2, §3, §4; PROMPTS_LOG.md |
| Contradictions | "AI never does arithmetic" vs qty×rate; latency; kill vs target thresholds | Parser returns qty and rate and the app multiplies; one metrics table (spec §21) |
| Privacy claim | "Data stays on phone" false (audio and names go to Groq) | Spec §18: accurate promise + data-flow table |
| Compliance | No DPDP section; Groq retention / DPA; per-speaker consent; minors | Spec §18 (ZDR, DPA, notice in 6 languages, rights, breach plan, per-speaker consent, no under-18 profiles) |
| Ethics | Maid deductions, confrontational disputes, family financial control | Deductions opt-in; neutral wording; no child view in v1; app lock; risk table spec §19 |
| Voice UX | Cut-offs; confirm card has no partial save; "maine" mis-attribution; questions saved as logs | Spec §11, J3: adaptive stop, partial save, spoken clarify one at a time, per-card re-record, member only from explicit names, answer cards |
| Onboarding | About 18 screens | Spec §8: 5 screens; the rest asked when it's needed |
| Localisation | Hindi-centric categories; "Khate" clash; native digits; name duplicates across scripts; gendered copy | Spec §8, §15, §17 |
| Missing journeys | Back after weeks, edits days later, rate change, archive, death of a member, accidental language switch, storage | Spec J4, J5, J15–J17 |
| Accessibility | White-on-marigold 3.0:1; warning 4.2:1; colour-only status; timed undo toast | Spec §16 |
| Groq limits | Default limits too low for evals and the demo | Developer tier + spend cap, small prompts, reasoning_effort low, global budget, cached demo, eval throttle and caching |
| Strict schema | v0.2 schema not valid in strict mode; enum mismatch | Spec §11 strict schema; fallback gpt-oss-20b |
| Whisper failure modes | Made-up text on silence; 224-token prompt cap; 10 s minimum billing | verbose_json filtering, client voice detection gate, prioritised vocabulary hint, cost per entry metric |
| Disk spooling | FastAPI UploadFile can write uploads to disk | Raw body read in memory with caps |
| Hosting | HF Docker now paid; Railway sleeps; Render cold starts | Render + one Docker image + keep-warm/paid window + browser-only cached demo |
| Node version | Node 20 is end-of-life | Node 22 |
| iOS | Separate storage for an installed PWA; no share target | Android Chrome primary; paste-reply-link box on iOS |
| UPI | P2P collect ended Oct 2025; prefilled amounts for personal UPI IDs unverified | Best-effort intent, Copy UPI ID, manual "Paid" mark, ₹1 test |
| Eval leakage | Prompt examples = test cases; tuning on test | Speaker-level dev/test split, frozen test, leakage check script |
| Calibration | LLM confidence can't catch ASR mishearings | Confusable sets per language (always flagged) + ASR scores + amount-span / derivability guard |
| Metric validity | CER guesses; matras stripped; script mismatch; small n | Normalised CER + amount-token error; thresholds after pilot; n / speakers / 95% CI; Hungarian matching; utterance exact match |
| Baselines | Groq choice unjustified | IndicConformer / Sarvam / turbo comparison (EVAL §6) |
| UX eval | Percentages on tiny n; A9 untested | Counts; planted-error test; retrospective probing; bias note |
| Eval ethics | "Delete if asked" only | Direct consent, Groq disclosed, ZDR first, 30-day deletion, gitignore, consent log |

## Items accepted as known limitations (not fixed)

- Telugu/Tamil ASR accuracy is likely lower; results are exploratory with fewer than 4 speakers. Safety net: read-back, flags, re-record.
- Prefilled-amount UPI links for personal UPI IDs may be declined by some apps (to be tested with ₹1).
- On-device storage can still be lost if the user clears browser data; mitigated by backup, not eliminated.
- DPDP interpretation (who is the data fiduciary for a prototype; timeline) to be confirmed with counsel before any real launch.
