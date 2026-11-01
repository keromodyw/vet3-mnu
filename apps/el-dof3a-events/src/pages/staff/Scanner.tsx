import { useCallback, useRef, useState } from 'react'
import { Camera, CheckCircle2, Clock3, Keyboard, ShieldX, XCircle } from 'lucide-react'
import BarcodeScanner from '../../components/BarcodeScanner'
import EventPicker, { rememberedEvent } from '../../components/EventPicker'
import { Counters, Feed, useLiveBoard } from '../../components/LiveBoard'
import StaffLayout from '../../components/StaffLayout'
import { btnPrimary, card, inputCls, Spinner } from '../../components/ui'
import { errText, rpc, type ScanResult } from '../../lib/api'
import { onlyDigits } from '../../lib/input'
import { feedbackBad, feedbackOk, feedbackWarn, unlockAudio } from '../../lib/sound'
import { formatCairo } from '../../lib/time'

interface Shown extends ScanResult { at: number; error?: string }

export default function Scanner() {
  const [eventId, setEventId] = useState(rememberedEvent())
  const [on, setOn] = useState(false)
  const [manual, setManual] = useState('')
  const [shown, setShown] = useState<Shown | null>(null)
  const [busy, setBusy] = useState(false)
  const inflight = useRef(false)
  const last = useRef({ code: '', at: 0 })
  const hideTimer = useRef<number | undefined>(undefined)
  const board = useLiveBoard(eventId || '00000000-0000-0000-0000-000000000000')

  const show = useCallback((r: Shown) => {
    setShown(r)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShown(null), r.result === 'ok' ? 2200 : 3800)
  }, [])

  const scan = useCallback(async (raw: string) => {
    if (!eventId) return
    const code = raw.trim()                            // national id (14) or academic number (8) — the server resolves both
    const t = Date.now()
    if (inflight.current) return
    if (last.current.code === code && t - last.current.at < 4000) return // same barcode still in front of the camera
    last.current = { code, at: t }
    inflight.current = true; setBusy(true)
    try {
      const r = await rpc<ScanResult>('md_scan', { p_event: eventId, p_code: code })
      if (r.result === 'ok') feedbackOk(); else if (r.result === 'not_approved') feedbackWarn(); else feedbackBad()
      show({ ...r, at: t })
      void board.reload()
    } catch (e) {
      feedbackBad(); show({ result: 'invalid', at: t, error: errText(e) })
      last.current = { code: '', at: 0 } // allow an immediate retry after a network error
    } finally { inflight.current = false; setBusy(false) }
  }, [eventId, show, board.reload])

  return (
    <StaffLayout title="السكانر" roles={['super_admin', 'scanner']} actions={<EventPicker value={eventId} onChange={setEventId} />}>
      <div className="space-y-4">
        {board.data && <Counters s={board.data.stats} />}

        {!on ? (
          <button className={`${btnPrimary} w-full py-6 text-xl`} disabled={!eventId} onClick={() => { unlockAudio(); setOn(true) }}><Camera className="w-6 h-6" /> تشغيل الكاميرا والبدء</button>
        ) : (
          <div className="relative">
            <BarcodeScanner onCode={scan} className="aspect-[4/3] w-full" />
            {busy && <div className="absolute top-3 left-3 bg-black/60 rounded-full p-2 text-emerald-300"><Spinner /></div>}
            <button onClick={() => setOn(false)} className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-black/60 text-xs text-white">إيقاف الكاميرا</button>
          </div>
        )}

        <form className={`${card} p-3 flex gap-2`} onSubmit={(e) => { e.preventDefault(); unlockAudio(); void scan(manual); setManual('') }}>
          <div className="relative flex-1"><Keyboard className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input className={`${inputCls} pr-10`} dir="ltr" inputMode="numeric" placeholder="الرقم القومي (14) أو الأكاديمي (8)" value={manual} onChange={(e) => setManual(onlyDigits(e.target.value, 14))} maxLength={14} /></div>
          <button className={btnPrimary} disabled={(manual.length !== 14 && manual.length !== 8) || !eventId}>تحقق</button>
        </form>

        <h2 className="font-bold pt-2">آخر السكانات (كل المنظمين)</h2>
        {board.data && <Feed rows={board.data.feed.slice(0, 15)} />}
      </div>

      {shown && <ResultOverlay r={shown} onClose={() => setShown(null)} />}
    </StaffLayout>
  )
}

function ResultOverlay({ r, onClose }: { r: Shown; onClose: () => void }) {
  const cfg = (() => {
    switch (r.result) {
      case 'ok': return { bg: 'bg-emerald-600', Icon: CheckCircle2, title: 'تمام — اتفضل ✓', sub: '' }
      case 'duplicate': return { bg: 'bg-red-700', Icon: XCircle, title: 'التذكرة دي اتعمل لها سكان قبل كده!', sub: r.first_scanned_at ? `أول دخول: ${formatCairo(r.first_scanned_at)}` : '' }
      case 'not_found': return { bg: 'bg-red-700', Icon: ShieldX, title: 'مفيش حجز بالرقم ده', sub: 'مش لاقي حجز ليه في الإيفينت ده' }
      case 'not_approved': return { bg: 'bg-amber-600', Icon: Clock3, title: r.status === 'declined' ? 'الحجز مرفوض' : 'الحجز لسه قيد المراجعة', sub: 'مينفعش يدخل' }
      default: return { bg: 'bg-red-700', Icon: ShieldX, title: r.error || 'كود غير صالح', sub: '' }
    }
  })()
  return (
    <div onClick={onClose} className={`fixed inset-0 z-[120] ${cfg.bg} flex flex-col items-center justify-center text-center p-8 text-white md-pop`}>
      <cfg.Icon className="w-28 h-28 mb-4" />
      <div className="text-3xl font-black mb-2">{cfg.title}</div>
      {cfg.sub && <div className="text-lg opacity-90 mb-4">{cfg.sub}</div>}
      {r.name && <div className="text-2xl font-extrabold">{r.name}</div>}
      {r.academic_no && <div className="opacity-80 mt-1">الرقم الأكاديمي: {r.academic_no}</div>}
      {r.seat && <div className="mt-4 px-8 py-3 rounded-3xl bg-black/25 text-5xl font-black">{r.seat}</div>}
      <div className="absolute bottom-8 text-sm opacity-70">اضغط لإغلاق — أو اعمل سكان للي بعده</div>
    </div>
  )
}
