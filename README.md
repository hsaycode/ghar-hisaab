# Ghar Hisaab — speak your household hisaab

Case-study prototype (not a Groww product). A household account book you **speak** into in Hindi, English,
Marathi, Bengali, Telugu or Tamil: daily spending, milk/maid/press bills, shop khata, family lena-dena and cash in hand.
The vendor (milkman, maid) sees the same bill through a WhatsApp link — a separate flow in the same app.

- Product spec: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) · Eval plan: [docs/EVAL_PLAN.md](docs/EVAL_PLAN.md)
- Council review log: [docs/COUNCIL_REVIEW.md](docs/COUNCIL_REVIEW.md) · Prompts log: [docs/PROMPTS_LOG.md](docs/PROMPTS_LOG.md)

## Architecture

```
React + Vite PWA (frontend/)  ──/api──►  FastAPI (backend/)  ──►  Groq whisper-large-v3  (speech → text)
  IndexedDB: all records on device        number normaliser +      Groq gpt-oss-120b → 20b → llama (fallback chain)
  MediaRecorder + voice-activity stop     amount guard            edge-tts neural voices (read-back, 6 languages)
```

## Local setup (conda only — nothing installed system-wide)

```powershell
# 1. Environment (Python 3.11 + Node 22 + ffmpeg inside conda)
#    If conda shows an SSL error (antivirus HTTPS inspection, e.g. Norton), prefix with: $env:CONDA_SSL_VERIFY="truststore";
conda create -n ghar-hisaab --override-channels -c conda-forge python=3.11 nodejs=22 ffmpeg -y
conda activate ghar-hisaab
pip install -r requirements-dev.txt
cd frontend; npm install; cd ..

# 2. Groq key (free tier is fine) — create backend/.env (never commit it)
copy backend\.env.example backend\.env   # then edit: GROQ_API_KEY=gsk_...

# 3. Run (two terminals, both with the env activated)
uvicorn app.main:app --app-dir backend --port 8000 --reload      # API
cd frontend; npm run dev                                         # UI at http://localhost:5173
#    From a phone on the same Wi-Fi (mic needs HTTPS):  $env:HTTPS="1"; npm run dev  -> https://<pc-ip>:5173

# Or production-like single server:
cd frontend; npm run build; cd ..; uvicorn app.main:app --app-dir backend --port 8000   # http://localhost:8000
```

## Tests

```powershell
pytest backend/tests evals/tests          # number normaliser, guards, API (Groq mocked), eval harness
cd frontend; npm test                     # billing engine, cash/khata/loan ledgers, vendor links, drafts
```

## Evals (verifiable & transparent)

```powershell
python evals/cases/build_text_cases.py    # 89 scripted cases, 6 languages, fixed dev/test split
python evals/check_leakage.py             # fails if any test phrase appears in the parser prompt
python evals/freeze.py                    # records SHA-256 of the test set in evals/MANIFEST.lock.json
python evals/run_parse_eval.py --split dev            # iterate on dev only
python evals/run_parse_eval.py --split test --publish # milestone run on the frozen test set
# Voice: record in the app's lab (start API with LAB_ENABLED=1, open /#/lab), then
python evals/run_voice_eval.py --split dev
```
Each run writes `evals/runs/<run_id>/` with `predictions.jsonl` (raw model output per case), `metrics.json`
and `report.md`; `--publish` also shows the results in the app at **/#/evals**. Reports carry the model id,
prompt hash, code hash and test-set hash so anyone can verify which code produced which number.

## Deploy (Render free, Docker)

1. Push this folder to a GitHub repo (`backend/.env` is git-ignored).
2. Render → New → Blueprint → pick the repo (uses `render.yaml`) → set `GROQ_API_KEY` in the dashboard.
3. Free instances sleep after ~15 min idle (≈1 min cold start). To keep it warm during evaluation, add a free
   uptime monitor (e.g. cron-job.org) hitting `https://<app>.onrender.com/api/health` every 10 minutes — one
   service running 24/7 fits in Render's 750 free hours/month. The demo house also works from saved results
   if the AI quota runs out.

## Free-tier strategy (single Groq key)

Groq's free limits are per model, so on HTTP 429 the server falls back to the next model in the chain
(`ASR_MODELS`, `LLM_MODELS` env). If every speech model is busy, the app offers the phone's own speech
recognition (Chrome Web Speech) and the user speaks once more. Rotating multiple accounts/keys to exceed
limits is against Groq's usage policy, so the app does not do it.
