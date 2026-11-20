// Mic capture with speaker-paced auto-stop (Web Audio energy-based voice activity detection).

export interface RecordOptions {
  silenceMs: number            // auto-stop after this much silence once speech was heard
  maxMs: number                // hard cap
  noSpeechTimeoutMs: number    // give up if nobody speaks
  onLevel?: (level: number, speaking: boolean) => void
  onCountdown?: (msLeft: number | null) => void
}

export interface RecordResult { blob: Blob; mime: string; hadSpeech: boolean; durationMs: number }

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

let earconCtx: AudioContext | null = null
export function earcon(kind: 'start' | 'stop') {
  try {
    earconCtx = earconCtx ?? new AudioContext()
    const ctx = earconCtx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = kind === 'start' ? 660 : 440
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.2)
  } catch { /* ignore */ }
}

export class Recorder {
  private stream?: MediaStream
  private ctx?: AudioContext
  private rec?: MediaRecorder
  private timer?: number
  private stopped = false
  private resolve!: (r: RecordResult) => void
  private reject!: (e: unknown) => void
  readonly result: Promise<RecordResult>

  constructor() {
    this.result = new Promise<RecordResult>((res, rej) => { this.resolve = res; this.reject = rej })
  }

  async start(opts: RecordOptions): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch (e) {
      this.reject(e)
      throw e
    }
    const mime = pickMime()
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)
    this.rec = rec
    const chunks: Blob[] = []
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data) }

    const ctx = new AudioContext()
    this.ctx = ctx
    if (ctx.state === 'suspended') await ctx.resume()
    const src = ctx.createMediaStreamSource(this.stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)

    const t0 = performance.now()
    let floorSum = 0, floorN = 0, floor = 0.01
    let hadSpeech = false
    let speechRun = 0
    let lastVoice = t0

    rec.onstop = () => {
      const durationMs = performance.now() - t0
      this.cleanup()
      this.resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), mime: rec.mimeType || mime, hadSpeech, durationMs })
    }
    rec.start(250)
    earcon('start')

    const tick = () => {
      if (this.stopped) return
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      const now = performance.now()
      const elapsed = now - t0
      if (elapsed < 300) { floorSum += rms; floorN++; floor = Math.max(0.004, floorSum / floorN) }
      const threshold = Math.max(floor * 2.4, floor + 0.01, 0.018)
      const speaking = rms > threshold
      if (speaking) {
        speechRun += 50
        if (speechRun >= 150) hadSpeech = true
        lastVoice = now
      } else {
        speechRun = 0
      }
      opts.onLevel?.(Math.min(1, rms / (threshold * 3)), speaking)
      const silentFor = now - lastVoice
      if (hadSpeech) {
        const left = opts.silenceMs - silentFor
        opts.onCountdown?.(left < 2000 ? Math.max(0, left) : null)
        if (left <= 0) return this.stop()
      } else if (elapsed > opts.noSpeechTimeoutMs) {
        return this.stop()
      }
      if (elapsed > opts.maxMs) return this.stop()
    }
    this.timer = window.setInterval(tick, 50)
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    if (this.timer) window.clearInterval(this.timer)
    earcon('stop')
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop()
    else this.cleanup()
  }

  cancel() {
    this.stop()
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close().catch(() => undefined)
  }
}
