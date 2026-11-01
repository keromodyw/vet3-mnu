import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Armchair, CalendarClock, Check, Copy, ImagePlus, MapPin, Timer, UserCheck, Wallet } from 'lucide-react'
import Modal from '../components/Modal'
import SeatMap, { HallPanel, seatView } from '../components/SeatMap'
import StudentLogin from '../components/StudentLogin'
import { toast } from '../components/feedback'
import { btnGhost, btnPrimary, card, FullLoader, Shell, Spinner, Stepper, stepLabels, ThemeToggle } from '../components/ui'
import { clearStudent, errText, eventPhase, fetchSeats, getStudent, rpc, type Booking, type EventRow, type Student } from '../lib/api'
import { compressImage } from '../lib/image'
import { sectionKeys } from '../lib/layout'
import { useLive } from '../lib/live'
import { feedbackBad, feedbackOk, feedbackWarn } from '../lib/sound'
import { supabase } from '../lib/supabase'
import { fmtCountdown, formatCairo, serverNow, useNow } from '../lib/time'

type Step = 'resolving' | 'scan' | 'seat' | 'confirm' | 'pay'

export default function Book() {
  const { id } = useParams()
  const eventId = id || ''
  const navigate = useNavigate()
  const now = useNow()
  const [student, setStudent] = useState<Student | null>(getStudent())
  const [booking, setBooking] = useState<Booking | null>(null)
  const [step, setStep] = useState<Step>(student ? 'resolving' : 'scan')
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [section, setSection] = useState<string>('ALL')
  const [busy, setBusy] = useState(false)

  const ev = useLive(async () => (await rpc<EventRow[]>('md_events_overview')).find((e) => e.id === eventId) || null, [{ table: 'events' }], 15000)
  const event = ev.data
  const seatsMode = event?.booking_mode !== 'names'
  const payment = event?.payment_required !== false
  const seatsLive = useLive(() => (seatsMode ? fetchSeats(eventId) : Promise.resolve([])), [{ table: 'seats', filter: `event_id=eq.${eventId}` }], 6000)
  const seats = seatsLive.data || []
  // section tabs: only the blocks that actually have seats, in map order (left → right)
  const secKeys = useMemo(() => sectionKeys(seats), [seats])
  useEffect(() => { if (section !== 'ALL' && !secKeys.includes(section)) setSection('ALL') }, [secKeys, section])

  // work out where this student is in the flow (also makes a page refresh resume correctly)
  useEffect(() => {
    if (!student) { setStep('scan'); return }
    if (!event) return
    let alive = true
    ;(async () => {
      try {
        const fresh = await rpc<Student | null>('md_lookup_student', { p_nid: student.national_id })
        if (!fresh) { clearStudent(); if (alive) setStudent(null); return }
        const list = await rpc<Booking[]>('md_my_bookings', { p_nid: student.national_id })
        if (!alive) return
        const mine = list.find((b) => b.event_id === eventId)
        if (mine && (mine.status === 'pending' || mine.status === 'approved')) { navigate('/booking', { replace: true }); return }
        if (mine && mine.status === 'awaiting_payment' && payment) { setBooking(mine); setStep('pay'); return }
        if (event.booking_mode === 'seats') { setStep('seat'); setModal(true) } else setStep('confirm')
      } catch (e) {
        toast(errText(e), 'error')
        if (alive) setStep(event.booking_mode === 'seats' ? 'seat' : 'confirm')
      }
    })()
    return () => { alive = false }
  }, [student?.national_id, eventId, event?.booking_mode, !!event, navigate])

  // the seat I picked got taken by someone else a moment ago
  useEffect(() => {
    if (!selected || !seatsLive.data) return
    const s = seatsLive.data.find((x) => x.id === selected)
    if (!s || seatView(s, serverNow()) !== 'free') {
      setSelected(null); feedbackWarn(); toast('الكرسي اللي اخترته اتحجز لحظتها — اختار كرسي تاني', 'error')
    }
  }, [seatsLive.data, selected])

  if (ev.loading) return <FullLoader />
  if (!event) {
    return <Shell><div className={`${card} p-8 text-center`}>الإيفينت ده مش متاح.<div className="mt-4"><Link to="/events" className={btnGhost}>كل الإيفينتات</Link></div></div></Shell>
  }
  const phase = eventPhase(event, now)
  const mineSeat = booking ? seats.find((s) => s.label === booking.seat_label) : undefined
  const picked = seats.find((s) => s.id === selected)
  const shownSeats = section === 'ALL' ? seats : seats.filter((s) => s.section === section)
  const freeIn = (k: string) => seats.filter((s) => s.section === k && seatView(s, now) === 'free'
    && (s.restriction === 'any' || s.restriction === student?.gender)).length
  const labels = stepLabels(event.booking_mode, payment)
  const stepIdx = step === 'scan' || step === 'resolving' ? 1 : step === 'pay' ? labels.indexOf('الدفع') : 2

  /** free events: nothing to pay → send it straight to the organisers (or auto-approve) */
  const finishWithoutPayment = async (b: Booking) => {
    await rpc('md_submit_payment', { p_booking: b.id, p_nid: student!.national_id, p_proof: null })
    feedbackOk(); navigate('/booking', { replace: true })
  }

  const confirmSeat = async () => {
    if (!student || !selected) return
    setBusy(true)
    try {
      const b = await rpc<Booking>('md_hold_seat', { p_event: eventId, p_nid: student.national_id, p_seat: selected })
      setModal(false); setSelected(null)
      if (!payment) return await finishWithoutPayment(b)
      feedbackOk(); setBooking(b); setStep('pay')
    } catch (e) {
      feedbackBad(); toast(errText(e), 'error'); setSelected(null); void seatsLive.reload(); void ev.reload()
    } finally { setBusy(false) }
  }

  const confirmName = async () => {
    if (!student) return
    setBusy(true)
    try {
      const b = await rpc<Booking>('md_reserve_spot', { p_event: eventId, p_nid: student.national_id })
      if (!payment) return await finishWithoutPayment(b)
      feedbackOk(); setBooking(b); setStep('pay')
    } catch (e) { feedbackBad(); toast(errText(e), 'error'); void ev.reload() } finally { setBusy(false) }
  }

  const backToChoice = () => { setBooking(null); void seatsLive.reload(); void ev.reload(); if (seatsMode) { setStep('seat'); setModal(true) } else setStep('confirm') }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <Link to="/events" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowRight className="w-4 h-4" /> الإيفينتات</Link>
        <ThemeToggle />
      </div>
      <div className={`${card} p-4 mb-5`}>
        <div className="font-extrabold text-lg">{event.title}</div>
        <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{formatCairo(event.event_at)}</span>
          {event.venue && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{event.venue}</span>}
        </div>
        {phase === 'soon' && event.booking_opens_at && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-500/10 border border-sky-500/30 px-3 py-2 text-sm text-sky-700 dark:text-sky-200">
            <Timer className="w-4 h-4 shrink-0" />
            <span className="flex-1">الحجز يفتح {formatCairo(event.booking_opens_at)}</span>
            <span className="font-black tabular-nums" dir="ltr">{fmtCountdown(new Date(event.booking_opens_at).getTime() - now)}</span>
          </div>
        )}
      </div>
      <Stepper labels={labels} step={stepIdx} />

      {step === 'resolving' && <FullLoader />}
      {step === 'scan' && <StudentLogin onStudent={setStudent} />}

      {(step === 'seat' || step === 'confirm') && student && (
        <div className="q-enter space-y-4">
          <StudentCard student={student} onSwitch={() => { clearStudent(); setStudent(null); setBooking(null) }} />
          {phase !== 'open' ? (
            <div className={`${card} p-6 text-center`}>
              {phase === 'soon' ? (<>الحجز لسه ما بدأش</>) : 'الحجز اتقفل'}
            </div>
          ) : step === 'seat' ? (
            <button className={`${btnPrimary} w-full py-4 text-lg`} onClick={() => setModal(true)}><Armchair className="w-5 h-5" /> اختار كرسيك</button>
          ) : (
            <div className={`${card} p-6 text-center space-y-4`}>
              <UserCheck className="w-12 h-12 mx-auto text-emerald-600" />
              <div><div className="font-extrabold text-lg">تسجيل بالاسم</div>
                <p className="text-sm text-muted mt-1">الإيفينت ده من غير اختيار كرسي — هنسجّل اسمك: <b className="text-ink">{student.name}</b></p></div>
              {event.spots_left !== null && event.spots_left !== undefined && <div className="text-sm text-muted">الأماكن المتبقية: <b className="text-ink">{event.spots_left}</b></div>}
              <button className={`${btnPrimary} w-full py-4 text-lg`} disabled={busy || event.spots_left === 0} onClick={confirmName}>
                {busy ? <Spinner /> : <Check className="w-5 h-5" />} {payment ? 'سجّلني وكمّل للدفع' : 'تأكيد التسجيل'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'pay' && student && booking && (
        <PayStep booking={booking} student={student} seatsMode={seatsMode} onChange={backToChoice} onExpired={backToChoice} />
      )}

      {modal && student && seatsMode && (
        <Modal
          title="اختار كرسيك" maxWidth="max-w-3xl" full flush onClose={() => setModal(false)}
          footer={
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-muted">{picked ? 'الكرسي المختار' : 'دوس على كرسي متاح'}</div>
                <div className={`font-black tabular-nums ${picked ? 'text-2xl text-emerald-700 dark:text-emerald-300' : 'text-sm text-muted'}`} dir="ltr">
                  {picked ? picked.label : '—'}
                </div>
              </div>
              <button className={`${btnPrimary} px-6 py-4 text-base`} disabled={!picked || busy} onClick={confirmSeat}>
                {busy ? <Spinner /> : <Check className="w-5 h-5" />} تأكيد الكرسي
              </button>
            </div>
          }
        >
          {seatsLive.loading ? <FullLoader /> : seats.length === 0 ? (
            <p className="text-center text-muted py-16">لسه ما اتحددتش كراسي للإيفينت دي</p>
          ) : (
            <div className="p-3 sm:p-4 space-y-3">
              {secKeys.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <Tab active={section === 'ALL'} label="كل الأقسام" count={secKeys.reduce((n, k) => n + freeIn(k), 0)} onClick={() => setSection('ALL')} />
                  {secKeys.map((k) => (
                    <Tab key={k} active={section === k} label={`قسم ${k}`} count={freeIn(k)} onClick={() => setSection(k)} />
                  ))}
                </div>
              )}
              <HallPanel>
                <SeatMap seats={shownSeats} now={now} gender={student.gender} mineId={mineSeat?.id} selectedIds={new Set(selected ? [selected] : [])}
                  onSeat={(s) => setSelected((cur) => (cur === s.id ? null : s.id))}
                  minScale={1} maxHeightRatio={0.5} />
              </HallPanel>
            </div>
          )}
        </Modal>
      )}
    </Shell>
  )
}

function StudentCard({ student, onSwitch }: { student: Student; onSwitch: () => void }) {
  return (
    <div className={`${card} p-4 flex items-center gap-3`}>
      <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black">{student.name.trim().charAt(0)}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{student.name}</div>
        <div className="text-xs text-muted">الرقم الأكاديمي: {student.academic_no || '—'}</div>
      </div>
      <button className="text-xs text-muted hover:text-ink underline" onClick={onSwitch}>مش أنا</button>
    </div>
  )
}

function Tab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold border transition ${active ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25' : 'bg-surface text-ink border-line hover:border-emerald-500'}`}>
      {label}
      <span className={`text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-white/20' : 'bg-ink/[.06] text-muted'}`} dir="ltr">{count}</span>
    </button>
  )
}

function PayStep({ booking, student, seatsMode, onChange, onExpired }: { booking: Booking; student: Student; seatsMode: boolean; onChange: () => void; onExpired: () => void }) {
  const navigate = useNavigate()
  const now = useNow()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired
  const left = booking.hold_until ? new Date(booking.hold_until).getTime() - now : 0
  const expiredNow = !!booking.hold_until && left <= 0

  // the payment window is over → drop the hold and quietly send the student back to picking a seat
  useEffect(() => {
    if (!expiredNow || busy) return
    const t = window.setTimeout(() => {
      void rpc('md_release_hold', { p_booking: booking.id, p_nid: student.national_id }).catch(() => { /* already expired on the server */ })
      onExpiredRef.current()                            // reset immediately — the release finishes in the background
    }, 2000)
    return () => window.clearTimeout(t)
  }, [expiredNow, busy, booking.id, student.national_id])

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const copy = async () => {
    try { await navigator.clipboard.writeText(booking.instapay_phone || ''); toast('اتنسخ الرقم') } catch { toast('انسخ الرقم يدوي', 'info') }
  }

  const submit = async () => {
    if (submitting.current) return
    if (!file) return toast('ارفع صورة إثبات الدفع الأول', 'error')
    submitting.current = true; setBusy(true)
    try {
      const blob = await compressImage(file)
      const path = `${booking.id}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('md-proofs').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
      await rpc('md_submit_payment', { p_booking: booking.id, p_nid: student.national_id, p_proof: path })
      feedbackOk()
      navigate('/booking', { replace: true })
    } catch (e) {
      if (/hold_expired|sold_out/.test(String((e as any)?.message))) onExpired()   // the hold is gone — reset silently
      else { feedbackBad(); toast(errText(e), 'error') }
    } finally { submitting.current = false; setBusy(false) }
  }

  return (
    <div className="q-enter space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">{seatsMode ? 'كرسيك' : 'حجزك'}</div>
            <div className="text-4xl font-black text-emerald-700 dark:text-emerald-300">{booking.seat_label || 'تسجيل بالاسم'}</div>
          </div>
          <div className="text-left">
            <div className="text-xs text-muted flex items-center gap-1 justify-end"><Timer className="w-3.5 h-3.5" /> {seatsMode ? 'الكرسي محجوز لك' : 'مكانك محجوز'}</div>
            <div className={`text-2xl font-black tabular-nums ${left <= 60000 ? 'text-red-600 dark:text-red-300' : 'text-ink'}`} dir="ltr">{left > 0 ? fmtCountdown(left) : '00:00:00'}</div>
          </div>
        </div>
        {seatsMode && <button className="text-xs text-muted hover:text-ink underline mt-3" onClick={onChange}>غيّر الكرسي</button>}
      </div>

      <div className={`${card} p-5 space-y-3`}>
        <div className="flex items-center gap-2 font-extrabold"><Wallet className="w-5 h-5 text-emerald-600" /> ادفع عن طريق InstaPay</div>
        <div className="text-sm text-ink/80">حوّل مبلغ <b className="text-emerald-700 dark:text-emerald-300 text-lg">{booking.price} جنيه</b> على الرقم:</div>
        <button onClick={copy} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-ink/5 border border-line hover:border-emerald-500">
          <span className="text-2xl font-black tracking-wider" dir="ltr">{booking.instapay_phone || '—'}</span><Copy className="w-5 h-5 text-muted" />
        </button>
        {booking.instapay_note && <p className="text-xs text-muted leading-relaxed">{booking.instapay_note}</p>}
      </div>

      <div className={`${card} p-5`}>
        <div className="font-extrabold mb-3">ارفع صورة التحويل</div>
        <label className="block cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {preview ? <img src={preview} alt="إثبات الدفع" className="w-full max-h-72 object-contain rounded-2xl bg-ink/5" /> : (
            <div className="h-36 rounded-2xl border-2 border-dashed border-line flex flex-col items-center justify-center gap-2 text-muted hover:border-emerald-500 hover:text-emerald-600">
              <ImagePlus className="w-8 h-8" /> اضغط لاختيار الصورة
            </div>
          )}
        </label>
        {preview && <button className="text-xs text-muted hover:text-ink underline mt-2" onClick={() => setFile(null)}>غيّر الصورة</button>}
      </div>

      <button className={`${btnPrimary} w-full py-4 text-lg`} disabled={busy || !file} onClick={submit}>
        {busy ? <><Spinner /> جاري الإرسال...</> : 'إتمام الحجز'}
      </button>
    </div>
  )
}
