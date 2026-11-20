# Prompts Log (submission deliverable #2)

The brief asks for "the prompts you used to create the tool". Log every prompt **as it's used**, not reconstructed later. Include the ones that failed and what changed after them; the iteration is the evidence.

## Format

| # | Date | Tool | Purpose | Prompt (verbatim or link) | Result | What I changed next |
|---|---|---|---|---|---|---|
| 1 | 2026-11-20 | Claude Code | Analyse the case study PS | "Go through the contents of the Product Case Study and understand the case…" | Evaluator-lens analysis | Asked for persona exploration |
| 2 | 2026-11-20 | Claude Code | Persona day-in-the-life exploration | "Take the user persona of people with different age groups…" | 12 personas, app-fit verdicts | Asked to go deeper; ideas felt generic |
| 3 | 2026-11-20 | Claude Code | Deeper routines + new ideas + ranking | "The ideas you have currently pitched are generic…" | New ideas, ranked | Asked for feasibility and assumptions |
| 4 | 2026-11-20 | Claude Code | Feasibility + assumptions for top 4 | "Go through the feasibility, how many assumptions…" | Hisaab vs Playbook | Explored more personas |
| 5 | 2026-11-20 | Claude Code | Hour-by-hour journeys, new ideas | "For each persona, assume that person's role…" | 14 new ideas | Asked to explain the top ideas |
| 6 | 2026-11-20 | Claude Code | Deep dive on Hisaab + voice expense idea from grandma conversation | "The scope for this idea is very narrow right?…" | Spec direction | Clarified requirements |
| 7 | 2026-11-20 | Claude Code | Requirements: languages, SMS opt-in, Groq, conda, vendor flow, farm | "I have a few questions and clarifications…" | PRODUCT_SPEC v0.2, EVAL_PLAN v0.2 | Ran council review |
| 8 | 2026-11-20 | Claude Code (5-agent council) | Gap review from PM, UX, Eng, Privacy, Evals seats | "Read the docs… Use an LLM council to do this final round of checks" | ~45 changes → v0.3 | Start build |

## Build prompts

| # | Date | Area | Prompt (summary; verbatim in session history) | Result | Next |
|---|---|---|---|---|---|
| 9 | 2026-11-20 | Full build | "1. Data storage claim unnecessary for a prototype. 2. Evaluation must be properly done, verifiable and transparent. 3. Similar-sounding words: does hard-coding restrict performance? 4. Onboarding smooth, aesthetic, no stage skipped. 5. Render free + Groq free tier: two keys or open-source ASR? find the best way. 6. No UPI links if there are issues. Notebook has income, khata, lena-dena; milk on calendar. I can record proxy audio. Use Claude Code + conda. Start with the building." | conda env (py3.11, node22, ffmpeg); FastAPI backend (Groq ASR + parser, number normaliser + amount guard, TTS, rate limits); React PWA (onboarding, voice capture, confirm cards, regular services, khata, lena-dena, cash, month, vendor flow, demo house, lab, evals page); 45 backend + 21 frontend + 6 harness tests passing; eval cases frozen | Add Groq key → run dev evals → iterate prompt on dev → milestone test run → deploy |
| 10 | 2026-11-20 | Fix | (Self-found) guard treated any quoted word as "unverified" | Tightened: unverified only for partial-lexicon languages (mr/bn/te/ta) | — |
| 12 | 2026-11-20 | Polish + features | "Even when English is selected there is Hindi text… entire text should be in the chosen language. Have you identified sound-alike issues in all languages? Can open-source Whisper be used? Infer UPI from the conversation. Month-by-month comparison (category / payment mode). Landing page not aesthetic, remove em dash. Fix the bugs." | Full localisation (missing keys filled, demo house + samples per language, service names follow UI language, localized weekdays/title) + a test that fails on hardcoded Indic text or missing keys; confusables = 3 layers (low ASR confidence, plausibility, per-language pairs) + observed-confusion table from voice eval; local Whisper benchmarked (tiny 2/15, base 2/15, small 6/15 amounts, up to 86 s/clip) → not used; UPI/card/bank inference in prompt + edit chips; Compare tab (monthly totals, category change, payment mode split, validated palette); landing redesigned | Add Groq key → dev eval |
| 14 | 2026-11-20 | Audit + live | "There is some issue on the settings page of the sample house. Go through the entire code base and find any such hardcoded issues. I have added the API key; can I try testing? What evals are used?" | Root cause: new chart class `.stack` collided with the spacing utility `.stack` and collapsed Settings, Cash, Regular and Vendor action groups (renamed + test that fails on duplicate CSS rules). Audit fixed: English screen-reader labels, uppercased mode codes, raw "2026-11" months, "-2" day offsets, English "k" suffix, cash-count note text, wrong remove/stop wording, bare language-switch confirm, hardcoded "Ghar"; evening nudge added (ritual time now used). Live: Norton TLS interception blocked Groq → OS trust store via `truststore`; mp3 upload mapping; first live calls OK (ASR 0.6 s, parse 1.9 s). Observed "milkman didn't come" → `leave`: fixed deterministically by service type in the app, prompt deliberately NOT tuned (phrase overlaps the frozen test set) | Dev eval → iterate on dev failures only |
| 13 | 2026-11-20 | Fix | (Self-found) a mid-line comment silently disabled Telugu "hundred" words | Caught by the number tests; fixed | — |
| 11 | 2026-11-20 | Fix | (Self-found) advance double-counted (deducted from bill and counted as payment) | Advances are payments towards the month; the bill is not reduced twice (unit-tested) | — |

## Runtime prompts (the app's own AI prompts)

The parser system prompt and Whisper vocabulary-prompt templates are versioned in `backend/prompts/`. Each version's eval result (dev set) is recorded in EVAL_PLAN's iteration log.
