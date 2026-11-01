import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Armchair, CalendarClock, LogOut, MapPin, Ticket, UserCheck } from 'lucide-react'
import StudentLogin from '../components/StudentLogin'
import { Badge, Brand, btnGhost, btnPrimary, card, FullLoader, Logo, Shell, ThemeToggle } from '../components/ui'
import { BATCH_AR, clearStudent, eventPhase, getStudent, rpc, type Booking, type EventRow, type Student } from '../lib/api'
import { useLive } from '../lib/live'
import { fmtCountdown, formatCairo, useNow } from '../lib/time'

const ACTIVE = ['awaiting_payment', 'pending', 'approved']

export default function Home() {
  const navigate = useNavigate()
  const [student, setStudent] = useState<Student | null>(getStudent())
  const now = useNow()

  const events = useLive(() => rpc<EventRow[]>('md_events_overview'), [{ table: 'seats' }, { table: 'events' }], 10000)
  const mine = useLive(
    async () => (student ? rpc<Booking[]>('md_my_bookings', { p_nid: student.national_id }) : []),
    [{ table: 'booking_pulse' }], 8000)
  useEffect(() => { void mine.reload() }, [student?.national_id])

  // right after a fresh login: someone who already booked lands on their bookings
  const onLogin = async (s: Student) => {
    try {
      const list = await rpc<Booking[]>('md_my_bookings', { p_nid: s.national_id })
      if (list.some((b) => ACTIVE.includes(b.status))) { navigate('/booking', { replace: true }); return }
    } catch { /* fall through to the home screen */ }
    setStudent(s)
  }

  // ---------- login portal: national id + academic number, nothing else ----------
  if (!student) {
    return (
      <Shell>
        <header className="flex justify-end mb-2"><ThemeToggle /></header>
        <div className="text-center mb-6">
          <Logo className="w-28 h-28 mx-auto mb-4" />
          <h1 className="text-2xl font-black">إيفينتات الدفعة</h1>
          <p className="text-muted text-sm mt-1">سجّل دخولك بالكارنيه الجامعي</p>
        </div>
        <div className={`${card} p-5`}><StudentLogin onStudent={(s) => void onLogin(s)} /></div>
      </Shell>
    )
  }

  const list = events.data || []
  const bookings = mine.data || []

  return (
    <Shell>
      <header className="flex items-center justify-between mb-6">
        <Brand />
        <ThemeToggle />
      </header>

      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 mb-6 shadow-lg shadow-emerald-600/20 relative overflow-hidden">
        <div className="absolute -left-8 -bottom-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute left-10 -top-10 w-24 h-24 rounded-full bg-white/10" />
        <h1 className="text-2xl font-black relative">احجز مكانك في الإيفينت الجاي!</h1>
      </div>

      <div className={`${card} p-4 mb-6 flex items-center gap-3`}>
        <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black">{student.name.trim().charAt(0)}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{student.name}</div>
          <div className="text-xs text-muted">{student.academic_no || '—'}{student.batch ? ` · ${BATCH_AR[student.batch]}` : ''}</div>
        </div>
        <Link to="/booking" className={btnGhost}><Ticket className="w-4 h-4" /> حجوزاتي</Link>
        <button className="p-2 text-muted hover:text-ink" title="تسجيل خروج" onClick={() => { clearStudent(); setStudent(null) }}><LogOut className="w-5 h-5" /></button>
      </div>

      <h2 className="font-extrabold text-lg mb-3">الإيفينتات المتاحة</h2>
      {events.loading ? (
        <div className="h-40 rounded-3xl bg-ink/5 animate-pulse" />
      ) : list.length === 0 ? (
        <div className={`${card} p-8 text-center text-muted`}>مفيش إيفينتات متاحة دلوقتي</div>
      ) : (
        <div className="space-y-4">
          {list.map((ev) => {
            const phase = eventPhase(ev, now)
            const names = ev.booking_mode === 'names'
            const soldOut = names ? ev.spots_left === 0 : (ev.seats_free ?? 0) <= 0
            const can = phase === 'open' && !soldOut
            const my = bookings.find((b) => b.event_id === ev.id && ACTIVE.includes(b.status))

            let action: { label: string; to: string; style: string; disabled?: boolean }
            if (my?.status === 'approved') action = { label: 'تمت الموافقة - تحميل التذكرة', to: `/booking?open=${my.id}`, style: btnPrimary }
            else if (my?.status === 'pending') action = { label: 'حالة الحجز', to: `/booking?open=${my.id}`, style: btnGhost }
            else if (my?.status === 'awaiting_payment') action = { label: 'كمّل الدفع', to: `/event/${ev.id}`, style: btnPrimary }
            else action = {
              label: can ? (names ? 'سجّل اسمك' : 'احجز كرسيك') : phase === 'soon' ? 'لسه ما فتحش' : phase === 'closed' ? 'الحجز اتقفل' : 'اكتمل العدد',
              to: `/event/${ev.id}`, style: btnPrimary, disabled: !can,
            }

            return (
              <div key={ev.id} className={`${card} overflow-hidden q-enter`}>
                {ev.poster_url && <img src={ev.poster_url} alt={ev.title} className="w-full h-auto block" />}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-extrabold">{ev.title}</h3>
                    {phase === 'soon' ? <Badge tone="sky">قريباً</Badge> : phase === 'closed' ? <Badge tone="red">الحجز اتقفل</Badge> : soldOut ? <Badge tone="red">اكتمل العدد</Badge> : <Badge tone="green">الحجز مفتوح</Badge>}
                  </div>
                  {ev.description && <p className="text-sm text-muted mt-2 leading-relaxed">{ev.description}</p>}
                  <div className="mt-3 space-y-1.5 text-sm text-ink/80">
                    <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-emerald-600" />{formatCairo(ev.event_at)}</div>
                    {ev.venue && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-600" />{ev.venue}</div>}
                    <div className="flex items-center gap-2">
                      {names ? <UserCheck className="w-4 h-4 text-emerald-600" /> : <Armchair className="w-4 h-4 text-emerald-600" />}
                      {names ? `تسجيل بالاسم · ${ev.spots_left == null ? 'أماكن غير محدودة' : `متبقي ${ev.spots_left} مكان`}` : `متبقي ${ev.seats_free ?? 0} من ${ev.seats_total ?? 0} كرسي`}
                      {' · '}{ev.payment_required && ev.price > 0 ? `${ev.price} جنيه` : 'مجاني'}
                    </div>
                  </div>
                  {phase === 'soon' && ev.booking_opens_at && !my && (
                    <div className="mt-4 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-200 text-sm text-center">
                      الحجز يفتح {formatCairo(ev.booking_opens_at)}
                      <div className="text-lg font-black tabular-nums mt-0.5" dir="ltr">{fmtCountdown(new Date(ev.booking_opens_at).getTime() - now)}</div>
                    </div>
                  )}
                  <button className={`${action.style} w-full mt-4`} disabled={action.disabled} onClick={() => navigate(action.to)}>{action.label}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {mine.loading && !mine.data && student && <FullLoader />}
    </Shell>
  )
}
