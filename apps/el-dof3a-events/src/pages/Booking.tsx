import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronDown, Clock3, Download, Timer, XCircle } from 'lucide-react'
import StudentLogin from '../components/StudentLogin'
import { toast } from '../components/feedback'
import { Badge, btnPrimary, card, FullLoader, Logo, Shell, Spinner, Stepper, stepLabels, ThemeToggle } from '../components/ui'
import { BATCH_AR, errText, getStudent, rpc, type Booking, type Student } from '../lib/api'
import { useLive } from '../lib/live'
import { feedbackOk, feedbackWarn } from '../lib/sound'
import { downloadTicket, renderTicket } from '../lib/ticket'
import { fmtCountdown, formatCairo, useNow } from '../lib/time'

export default function BookingPage() {
  const [student, setStudent] = useState<Student | null>(getStudent())
  if (!student) {
    return (
      <Shell>
        <header className="flex justify-end mb-2"><ThemeToggle /></header>
        <div className="text-center mb-5"><Logo className="w-20 h-20 mx-auto mb-3" /><h1 className="text-xl font-black">حجوزاتي</h1></div>
        <div className={`${card} p-5`}><StudentLogin onStudent={setStudent} /></div>
      </Shell>
    )
  }
  return <BookingList student={student} />
}

function BookingList({ student }: { student: Student }) {
  const [params] = useSearchParams()
  const [ids, setIds] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)   // undefined = default (requested one, else the newest)
  const prev = useRef<Record<string, string>>({})

  const { data, loading } = useLive(
    async () => {
      const list = await rpc<Booking[]>('md_my_bookings', { p_nid: student.national_id })   // newest first
      setIds(list.map((b) => b.id))
      return list
    },
    ids.length ? [{ table: 'booking_pulse', filter: `id=in.(${ids.join(',')})` }] : [],
    6000,
  )

  // announce decisions the moment they arrive
  useEffect(() => {
    for (const b of data || []) {
      const was = prev.current[b.id]
      if (was && was !== b.status) {
        if (b.status === 'approved') { feedbackOk(); toast('اتقبل حجزك 🎉 تقدر تنزل التذكرة', 'success') }
        if (b.status === 'declined') { feedbackWarn(); toast('للأسف الطلب اترفض', 'error') }
      }
      prev.current[b.id] = b.status
    }
  }, [data])

  if (loading) return <FullLoader />
  const list = data || []
  const open = openId === undefined ? (params.get('open') && list.some((b) => b.id === params.get('open')) ? params.get('open') : list[0]?.id) : openId

  return (
    <Shell>
      <div className="flex items-center justify-between mb-5">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowRight className="w-4 h-4" /> الإيفينتات</Link>
        <ThemeToggle />
      </div>

      <div className={`${card} p-4 mb-5 flex items-center gap-3`}>
        <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black">{student.name.trim().charAt(0)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{student.name}</div>
          <div className="text-xs text-muted">{student.academic_no || '—'}{student.batch ? ` · ${BATCH_AR[student.batch]}` : ''}</div>
        </div>
      </div>

      <h1 className="font-extrabold text-lg mb-3">حجوزاتي</h1>
      {list.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="text-ink/80">مفيش حجوزات لسه.</p>
          <Link to="/" className={`${btnPrimary} mt-4`}>شوف الإيفينتات</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((b) => <BookingRow key={b.id} b={b} open={open === b.id} onToggle={() => setOpenId(open === b.id ? null : b.id)} />)}
        </div>
      )}
    </Shell>
  )
}

const STATUS: Record<string, { label: string; tone: 'amber' | 'sky' | 'green' | 'red' }> = {
  awaiting_payment: { label: 'بانتظار الدفع', tone: 'amber' },
  pending: { label: 'قيد المراجعة', tone: 'sky' },
  approved: { label: 'تمت الموافقة', tone: 'green' },
  declined: { label: 'مرفوض', tone: 'red' },
}

function BookingRow({ b, open, onToggle }: { b: Booking; open: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const now = useNow()
  const labels = stepLabels(b.booking_mode, b.payment_required)
  const step = b.status === 'awaiting_payment' ? Math.max(0, labels.indexOf('الدفع')) : b.status === 'pending' ? labels.length - 1 : labels.length
  const st = STATUS[b.status] || STATUS.pending

  return (
    <div className={`${card} overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-right" aria-expanded={open}>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold truncate">{b.event_title}</div>
          <div className="text-xs text-muted mt-0.5 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{formatCairo(b.event_at)}</div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
        <ChevronDown className={`w-5 h-5 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 q-enter border-t border-line pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{b.event_venue || ''}</span>
            <span className="text-center"><span className="text-[11px] text-muted ml-2">{b.seat_label ? 'الكرسي' : 'التسجيل'}</span><b className="text-xl text-emerald-700 dark:text-emerald-300">{b.seat_label || 'بالاسم'}</b></span>
          </div>

          {b.status !== 'declined' && <Stepper labels={labels} step={step} />}

          {b.status === 'awaiting_payment' && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 text-center space-y-3">
              <Timer className="w-8 h-8 mx-auto text-amber-600 dark:text-amber-300" />
              <div className="font-bold">لسه ما كملتش الدفع</div>
              {b.hold_until && <div className="text-2xl font-black tabular-nums" dir="ltr">{fmtCountdown(new Date(b.hold_until).getTime() - now)}</div>}
              <button className={btnPrimary} onClick={() => navigate(`/event/${b.event_id}`)}>كمّل الدفع</button>
            </div>
          )}

          {b.status === 'pending' && (
            <div className="rounded-2xl bg-sky-500/10 border border-sky-500/30 p-6 text-center space-y-2">
              <div className="relative w-14 h-14 mx-auto"><span className="absolute inset-0 rounded-full bg-sky-400/30 animate-ping" /><Clock3 className="relative w-14 h-14 text-sky-600 dark:text-sky-300" /></div>
              <p className="text-sm text-ink/80 leading-relaxed">هيتم مراجعة طلبك و الرد عليك في أقرب وقت. بعد المراجعة هتقدر تنزل التيكت بتاعتك من هنا.</p>
            </div>
          )}

          {b.status === 'approved' && <Approved b={b} />}

          {b.status === 'declined' && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-5 space-y-3 text-center">
              <XCircle className="w-10 h-10 mx-auto text-red-600 dark:text-red-300" />
              <div className="font-extrabold text-lg">الطلب اترفض</div>
              {b.decline_reason && <p className="text-sm text-red-700 dark:text-red-200">السبب: {b.decline_reason}</p>}
              <button className={btnPrimary} onClick={() => navigate(`/event/${b.event_id}`)}>احجز تاني</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Approved({ b }: { b: Booking }) {
  const [img, setImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    renderTicket(b).then((c) => alive && setImg(c.toDataURL('image/png'))).catch(() => undefined)
    return () => { alive = false }
  }, [b.id, b.seat_label, b.name])

  const download = async () => {
    setBusy(true)
    try { await downloadTicket(b) } catch (e) { toast(errText(e), 'error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {b.scanned_at && <div className="text-center"><Badge tone="red">التذكرة اتستخدمت — دخلت {formatCairo(b.scanned_at)}</Badge></div>}
      <button className={`${btnPrimary} w-full`} disabled={busy} onClick={download}>{busy ? <Spinner /> : <Download className="w-5 h-5" />} تحميل التذكرة</button>
      {img ? <img src={img} alt="تذكرتك" className="w-full rounded-3xl shadow-xl shadow-black/20" /> : <div className="h-64 rounded-3xl bg-ink/5 animate-pulse" />}
    </div>
  )
}
