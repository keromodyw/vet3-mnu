import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { BarcodeFormat, BinaryBitmap, DecodeHintType, GlobalHistogramBinarizer, HTMLCanvasElementLuminanceSource, HybridBinarizer, MultiFormatReader } from '@zxing/library'
import { Camera, CameraOff, Check, ChevronDown, RefreshCw, Zap, ZapOff, ZoomIn, ZoomOut } from 'lucide-react'

interface Cam { deviceId: string; label: string }
const LS_CAM = 'eld_cam'
const readCam = () => { try { return localStorage.getItem(LS_CAM) || '' } catch { return '' } }

/** the ticket carries a QR code and nothing else — QR reads from any angle, in bad light, and the browser can decode it natively */
const NATIVE_FORMATS = ['qr_code']
const NATIVE_OK = new Set(NATIVE_FORMATS)
const QR_FORMATS: BarcodeFormat[] = [BarcodeFormat.QR_CODE]

/** TRY_HARDER makes ZXing look at the whole frame, not just the middle band. */
const hints = (formats: BarcodeFormat[]) => new Map<DecodeHintType, any>([
  [DecodeHintType.POSSIBLE_FORMATS, formats],
  [DecodeHintType.TRY_HARDER, true],
])

/** getUserMedia that never hangs forever (iOS can leave the promise pending if the prompt is ignored) */
const gum = (c: MediaStreamConstraints) => new Promise<MediaStream>((resolve, reject) => {
  const p = navigator.mediaDevices.getUserMedia(c)
  const t = window.setTimeout(() => {
    p.then((s) => s.getTracks().forEach((x) => x.stop())).catch(() => undefined)
    reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
  }, 15000)
  p.then((s) => { window.clearTimeout(t); resolve(s) }, (e) => { window.clearTimeout(t); reject(e) })
})

const errText = (e: any) => {
  const n = e?.name || ''
  if (!window.isSecureContext) return 'الكاميرا بتشتغل بس على رابط آمن (https)'
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'الكاميرا مقفولة — اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح'
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'مفيش كاميرا متاحة على الجهاز ده'
  if (n === 'NotReadableError' || n === 'AbortError') return 'الكاميرا مستخدمة في تطبيق تاني — اقفله وجرّب تاني'
  if (n === 'TimeoutError') return 'المتصفح مردش على طلب الكاميرا — دوس "جرّب تاني" واسمح بالكاميرا'
  return 'مقدرناش نشغّل الكاميرا'
}

/**
 * Live camera → QR reader built for the entrance hall:
 *  · native BarcodeDetector (very fast on Android) + a ZXing QR fallback everywhere else
 *  · the WHOLE frame is scanned, not a small box; QR needs no rotation pass (any angle reads)
 *  · fast passes first; inverted frames, bigger resolution and a robust binarizer only when nothing reads
 *  · asks for 1080p, continuous autofocus/exposure/white balance, tap-to-focus, zoom and flash when supported
 *  · lists every camera on the device; switching stops the old stream first and ignores stale async work (no crashes)
 * Calls onCode for EVERY read; the caller decides how to debounce.
 */
export default function BarcodeScanner({ onCode, className = '' }: { onCode: (code: string) => void; className?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const session = useRef(0) // bumped on every (re)start/stop → older async work bails out
  const cb = useRef(onCode)
  cb.current = onCode
  const lastHit = useRef(0) // set when the camera starts / on every read
  const caps = useRef<any>({})
  const torchTouched = useRef(false) // the user pressed the flash button → stop auto-switching it

  const [cams, setCams] = useState<Cam[]>([])
  const [camId, setCamId] = useState(readCam())
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState(false)
  const [torch, setTorch] = useState(false)
  const [canTorch, setCanTorch] = useState(false)
  const [zoom, setZoom] = useState<{ v: number; min: number; max: number } | null>(null)

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    const v = video.current
    if (v) { try { v.pause() } catch { /* ignore */ } v.srcObject = null }
  }, [])

  const listCams = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setCams(all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `كاميرا ${i + 1}` })))
    } catch { /* ignore */ }
  }, [])

  const tune = useCallback(async (track: MediaStreamTrack) => {
    const c: any = (track as any).getCapabilities?.() || {}
    caps.current = c
    for (const [k, mode] of [['focusMode', 'continuous'], ['exposureMode', 'continuous'], ['whiteBalanceMode', 'continuous']] as const) {
      if (c[k]?.includes?.(mode)) { try { await track.applyConstraints({ advanced: [{ [k]: mode } as any] }) } catch { /* not supported */ } }
    }
    const s: any = track.getSettings?.() || {}
    setCanTorch(!!(c.torch ?? s.torch))
    setTorch(!!s.torch)
    setZoom(c.zoom ? { v: s.zoom || c.zoom.min || 1, min: c.zoom.min ?? 1, max: c.zoom.max ?? 1 } : null)
  }, [])

  /** the decode loop: native detector first, then full-frame ZXing passes (cheapest + most likely first) */
  const runLoop = useCallback((my: number) => {
    /** only ask the browser for formats it actually supports — QR/matrix codes are never requested */
    let native: any = null
    const nativeReady = (async () => {
      const Ctor = (window as any).BarcodeDetector
      if (!Ctor) return
      try {
        const all: string[] = typeof Ctor.getSupportedFormats === 'function' ? await Ctor.getSupportedFormats() : NATIVE_FORMATS
        const usable = NATIVE_FORMATS.filter((f) => all.includes(f))
        native = usable.length ? new Ctor({ formats: usable }) : null
      } catch { try { native = new Ctor() } catch { native = null } }
    })()

    const qr = new MultiFormatReader()
    qr.setHints(hints(QR_FORMATS))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let pass = 0

    /** fast=true uses the cheap binarizer (fine for a clean, high-contrast QR); the retries use the robust one */
    const decode = (reader: MultiFormatReader, invert: boolean, fast: boolean): string | null => {
      try {
        const lum = new HTMLCanvasElementLuminanceSource(canvas)
        const src = invert ? lum.invert() : lum          // invert in JS (not via ctx.filter) so a dark-mode ticket reads too
        const bin = fast ? new GlobalHistogramBinarizer(src) : new HybridBinarizer(src)
        return reader.decodeWithState(new BinaryBitmap(bin)).getText()
      } catch { return null }
    }

    /** draw the WHOLE frame */
    const draw = (v: HTMLVideoElement, maxW: number) => {
      if (!ctx) return
      const k = Math.min(1, maxW / v.videoWidth)
      const w = Math.max(1, Math.round(v.videoWidth * k))
      const h = Math.max(1, Math.round(v.videoHeight * k))
      if (canvas.width !== w) canvas.width = w        // resizing reallocates — only when it really changes
      if (canvas.height !== h) canvas.height = h
      ctx.drawImage(v, 0, 0, w, h)
    }

    const scan = (v: HTMLVideoElement, maxW: number, reader: MultiFormatReader, invert = false, fast = false): string | null => {
      if (!ctx) return null
      draw(v, maxW)
      return decode(reader, invert, fast)
    }

    const step = async () => {
      if (my !== session.current) return
      const v = video.current
      if (!v || v.readyState < 2 || !v.videoWidth) { window.setTimeout(step, 80); return } // camera still warming up
      let text: string | null = null
      if (native) {
        try {
          const r = await native.detect(v)
          if (r?.length) text = r.find((x: any) => x.rawValue && NATIVE_OK.has(x.format))?.rawValue || null
        } catch { /* fall through to ZXing */ }
      }
      if (!text) {
        const idle = Date.now() - lastHit.current
        const p = pass
        // pass 0 is the one that matters: a small frame + the cheap binarizer — usually reads on the first try
        if (p === 0) text = scan(v, 1024, qr, false, true)
        else if (p === 1) text = scan(v, 1024, qr)                    // same size, robust binarizer
        else if (p === 2) text = scan(v, 1280, qr)                    // sharper
        else if (p === 3 && idle > 700) text = scan(v, 1024, qr, true) // inverted (QR on a dark screen)
        else if (p === 4 && idle > 1500) text = scan(v, 1920, qr)     // the sharpest frame the camera gives us
        pass = (p + 1) % 5
      }
      if (text && my === session.current) {
        lastHit.current = Date.now()
        pass = 0                                        // start again from the cheapest pass after every read
        try { cb.current(text) } catch { /* consumer error */ }
      }
      window.setTimeout(step, 16)
    }
    void nativeReady
    void step()
  }, [])

  const start = useCallback(async (deviceId: string) => {
    const my = ++session.current
    stop()
    setStarting(true); setError(''); setTorch(false); setMenu(false)
    lastHit.current = Date.now()
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no mediaDevices'), { name: 'SecurityError' })
      const base: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
      const tries: MediaStreamConstraints[] = []
      if (deviceId) tries.push({ audio: false, video: { ...base, deviceId: { exact: deviceId } } })
      tries.push({ audio: false, video: { ...base, facingMode: { ideal: 'environment' } } })
      tries.push({ audio: false, video: { facingMode: { ideal: 'environment' } } })
      tries.push({ audio: false, video: true })
      let s: MediaStream | null = null
      let lastErr: any = null
      for (const c of tries) {
        try { s = await gum(c); break } catch (e: any) {
          lastErr = e
          if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError' || e?.name === 'NotReadableError' || e?.name === 'TimeoutError') break
        }
      }
      if (!s) throw lastErr || new Error('no camera')
      if (my !== session.current) { s.getTracks().forEach((t) => t.stop()); return }
      if (deviceId && s.getVideoTracks()[0]?.getSettings().deviceId !== deviceId) { try { localStorage.removeItem(LS_CAM) } catch { /* ignore */ } } // saved camera is gone
      stream.current = s
      const v = video.current
      if (!v) { s.getTracks().forEach((t) => t.stop()); return }
      v.srcObject = s
      void v.play().catch(() => { /* a tap on the preview resumes it */ })
      const track = s.getVideoTracks()[0]
      if (!track) { s.getTracks().forEach((t) => t.stop()); throw new Error('no video track') }
      await tune(track)
      const id = track.getSettings().deviceId
      if (id) { setCamId(id); try { localStorage.setItem(LS_CAM, id) } catch { /* ignore */ } }
      void listCams()                                  // labels are only available after permission — never block the first scan on it
      if (my !== session.current) return
      setStarting(false)
      runLoop(my)
    } catch (e) {
      if (my === session.current) { setStarting(false); setError(errText(e)) }
    }
  }, [stop, tune, listCams, runLoop])

  useEffect(() => {
    void start(readCam())
    const onVis = () => { if (document.visibilityState === 'hidden') { session.current++; stop() } else void start(readCam()) }
    const onDev = () => void listCams()
    document.addEventListener('visibilitychange', onVis)
    navigator.mediaDevices?.addEventListener?.('devicechange', onDev)
    return () => {
      session.current++
      stop()
      document.removeEventListener('visibilitychange', onVis)
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDev)
    }
  }, [start, stop, listCams])

  // low light / close-up: nudge the autofocus — and in a dark room switch the flash on by itself (the single biggest win there)
  useEffect(() => {
    const probe = document.createElement('canvas')
    probe.width = 40; probe.height = 30
    const pctx = probe.getContext('2d', { willReadFrequently: true })
    const t = window.setInterval(() => {
      if (Date.now() - lastHit.current < 3500) return
      const v = video.current
      const track = stream.current?.getVideoTracks()[0]
      const c = caps.current
      if (!track) return
      if (c.focusMode?.includes?.('single-shot')) {
        void (async () => {
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as any] })
            await new Promise((r) => window.setTimeout(r, 900))
            if (c.focusMode?.includes?.('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] })
          } catch { /* ignore */ }
        })()
      }
      // measure brightness on a tiny copy (cheap) and light it up only when it is really dark
      const on = !!(track.getSettings?.() as any)?.torch
      if (!pctx || !v || !v.videoWidth || torchTouched.current || on || !c.torch) return
      try {
        pctx.drawImage(v, 0, 0, probe.width, probe.height)
        const d = pctx.getImageData(0, 0, probe.width, probe.height).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
        if (sum / (d.length / 4) > 45) return
        void track.applyConstraints({ advanced: [{ torch: true } as any] }).then(() => setTorch(true)).catch(() => undefined)
      } catch { /* torch not really available */ }
    }, 5000)
    return () => window.clearInterval(t)
  }, [])

  const track = () => stream.current?.getVideoTracks()[0]
  const toggleTorch = async () => {
    const next = !torch
    torchTouched.current = true                          // the user decided — never auto-switch again
    try { await track()?.applyConstraints({ advanced: [{ torch: next } as any] }); setTorch(next) } catch { /* ignore */ }
  }
  const setZoomTo = async (v: number) => {
    if (!zoom) return
    const nv = Math.min(zoom.max, Math.max(zoom.min, v))
    try { await track()?.applyConstraints({ advanced: [{ zoom: nv } as any] }); setZoom({ ...zoom, v: nv }) } catch { /* ignore */ }
  }
  const tapFocus = async (e: MouseEvent<HTMLVideoElement>) => {
    const v = video.current
    if (!v) return
    void v.play().catch(() => { /* ignore */ })                 // also resumes a paused preview
    const t = track()
    if (!t || !v.videoWidth) return
    const c = caps.current
    const r = v.getBoundingClientRect()
    const scale = Math.max(r.width / v.videoWidth, r.height / v.videoHeight)  // object-cover mapping
    const dw = v.videoWidth * scale, dh = v.videoHeight * scale
    const x = Math.min(1, Math.max(0, (e.clientX - r.left - (r.width - dw) / 2) / dw))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top - (r.height - dh) / 2) / dh))
    const adv: any = { focusMode: 'single-shot' }
    if (c.pointsOfInterest) adv.pointsOfInterest = [{ x, y }]
    try {
      await t.applyConstraints({ advanced: [adv] })
      window.setTimeout(() => { if (c.focusMode?.includes?.('continuous')) void t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => undefined) }, 1400)
    } catch { /* ignore */ }
  }

  const current = cams.find((c) => c.deviceId === camId)
  const pick = (id: string) => { setCamId(id); try { localStorage.setItem(LS_CAM, id) } catch { /* ignore */ } void start(id) }

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-black ${className}`}>
      <video ref={video} className="w-full h-full object-cover" playsInline muted autoPlay onClick={tapFocus} onLoadedMetadata={() => { void video.current?.play().catch(() => undefined) }} />

      {/* the whole preview is the scan area — no small target box */}
      {!error && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-2 rounded-2xl border border-white/20" />
          {['top-2 right-2 border-t-4 border-r-4 rounded-tr-2xl', 'top-2 left-2 border-t-4 border-l-4 rounded-tl-2xl', 'bottom-2 right-2 border-b-4 border-r-4 rounded-br-2xl', 'bottom-2 left-2 border-b-4 border-l-4 rounded-bl-2xl'].map((c) => (
            <span key={c} className={`absolute w-8 h-8 border-emerald-400 ${c}`} />
          ))}
          <div className="md-scanline" />
        </div>
      )}

      {/* top bar: camera picker + flash + zoom */}
      {!error && !starting && (
        <div className="absolute top-2 inset-x-2 flex items-start justify-between gap-2">
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1.5 max-w-[11rem] px-3 py-2 rounded-xl bg-black/60 text-white text-xs backdrop-blur">
              <Camera className="w-4 h-4 shrink-0" /><span className="truncate">{current?.label || 'الكاميرا'}</span><ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </button>
            {menu && (
              <div className="absolute z-20 mt-1 w-64 max-h-60 overflow-y-auto rounded-2xl bg-slate-900/95 text-white text-sm shadow-2xl border border-white/10 backdrop-blur">
                {cams.length === 0 && <div className="p-3 text-slate-400 text-xs">مفيش كاميرات ظاهرة</div>}
                {cams.map((c) => (
                  <button key={c.deviceId} onClick={() => pick(c.deviceId)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right hover:bg-white/10">
                    <span className="truncate">{c.label}</span>{c.deviceId === camId && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </button>
                ))}
                <button onClick={() => void listCams()} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 border-t border-white/10 hover:bg-white/10"><RefreshCw className="w-3.5 h-3.5" /> تحديث القائمة</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {zoom && zoom.max > zoom.min && (<>
              <button onClick={() => setZoomTo(zoom.v / 1.25)} className="p-2 rounded-xl bg-black/60 text-white backdrop-blur" aria-label="تصغير"><ZoomOut className="w-4 h-4" /></button>
              <button onClick={() => setZoomTo(zoom.v * 1.25)} className="p-2 rounded-xl bg-black/60 text-white backdrop-blur" aria-label="تكبير"><ZoomIn className="w-4 h-4" /></button>
            </>)}
            {canTorch && <button onClick={toggleTorch} className={`p-2 rounded-xl backdrop-blur ${torch ? 'bg-yellow-400 text-black' : 'bg-black/60 text-white'}`} aria-label="الفلاش">{torch ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}</button>}
          </div>
        </div>
      )}

      {/* guidance */}
      {!error && starting && (
        <div className="absolute bottom-2 inset-x-2 text-center">
          <span className="inline-block px-4 py-2 rounded-full bg-black/65 text-white text-sm font-semibold backdrop-blur">بنشغّل الكاميرا…</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 bg-slate-950 text-slate-200">
          <CameraOff className="w-10 h-10 text-red-400" />
          <p className="text-sm leading-relaxed">{error}</p>
          <button onClick={() => void start(readCam())} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">جرّب تاني</button>
        </div>
      )}
    </div>
  )
}
