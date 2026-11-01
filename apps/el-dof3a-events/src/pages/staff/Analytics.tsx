import { useMemo, useState } from 'react'
import EventPicker, { rememberedEvent } from '../../components/EventPicker'
import SeatMap, { HallPanel, type Mark } from '../../components/SeatMap'
import StaffLayout from '../../components/StaffLayout'
import { card, FullLoader } from '../../components/ui'
import { fetchSeats, rpc, type EventStats } from '../../lib/api'
import { useLive } from '../../lib/live'
import { supabase } from '../../lib/supabase'
import { useNow } from '../../lib/time'

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return <div className="h-2.5 rounded-full bg-ink/10 overflow-hidden"><div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>
}
const Stat = ({ l, v, c = 'text-ink' }: { l: string; v: number | string; c?: string }) => (
  <div className="text-center"><div className={`text-3xl font-black tabular-nums ${c}`}>{v}</div><div className="text-xs text-muted">{l}</div></div>
)
const money = (n: number) => `${Number(n).toLocaleString('ar-EG')} ج`
const AMB = 'text-amber-600 dark:text-amber-300', GRN = 'text-emerald-600 dark:text-emerald-300', RED = 'text-red-600 dark:text-red-300', SKY = 'text-sky-600 dark:text-sky-300', PNK = 'text-pink-600 dark:text-pink-300'

export default function Analytics() {
  const [eventId, setEventId] = useState(rememberedEvent())
  return (
    <StaffLayout title="التقارير" roles={['super_admin']} wide actions={<EventPicker value={eventId} onChange={setEventId} />}>
      {eventId ? <Body eventId={eventId} /> : <FullLoader />}
    </StaffLayout>
  )
}

function Body({ eventId }: { eventId: string }) {
  const f = `event_id=eq.${eventId}`
  const now = useNow()
  const { data, loading } = useLive(async () => {
    const [stats, seats, bk] = await Promise.all([
      rpc<EventStats>('md_event_stats', { p_event: eventId }),
      fetchSeats(eventId),
      supabase.from('bookings').select('seat_id,status,scanned_at').eq('event_id', eventId).in('status', ['awaiting_payment', 'pending', 'approved']).not('seat_id', 'is', null),
    ])
    const marks: Record<string, Mark> = {}
    for (const b of (bk.data || []) as Array<{ seat_id: string; status: string; scanned_at: string | null }>) {
      marks[b.seat_id] = b.status === 'approved' ? (b.scanned_at ? 'entered' : 'approved') : 'pending'
    }
    return { stats, seats, marks }
  }, [{ table: 'bookings', filter: f }, { table: 'seats', filter: f }, { table: 'scans', filter: f }], 10000)
  const s = data?.stats
  const booked = useMemo(() => (s ? s.approved + s.pending : 0), [s])
  if (loading || !data || !s) return <FullLoader />

  const batches: Array<[string, number, string]> = [['دفعة أولى', s.batch_first, 'bg-emerald-500'], ['دفعة ثانية', s.batch_second, 'bg-sky-500'], ['دفعة ثالثة', s.batch_third, 'bg-violet-500'], ['دفعة رابعة', s.batch_fourth, 'bg-amber-500']]

  return (
    <div className="space-y-4">
      {s.booking_mode === 'seats' && data.seats.length > 0 && (
        <div className={`${card} p-4`}>
          <h3 className="font-extrabold mb-3">خريطة الكراسي</h3>
          <HallPanel><SeatMap readOnly seats={data.seats} now={now} marks={data.marks} maxHeightRatio={0.7} /></HallPanel>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {s.booking_mode === 'names' ? (
          <div className={`${card} p-5 space-y-4`}>
            <h3 className="font-extrabold">السعة (تسجيل بالاسم)</h3>
            <div className="grid grid-cols-3 gap-2"><Stat l="السعة" v={s.max_bookings ?? '∞'} /><Stat l="محجوز" v={booked} c={SKY} /><Stat l="متبقي" v={s.max_bookings === null ? '∞' : Math.max(0, s.max_bookings - booked)} c={GRN} /></div>
            {s.max_bookings ? <Bar value={booked} max={s.max_bookings} color="bg-sky-500" /> : null}
          </div>
        ) : (
          <div className={`${card} p-5 space-y-4`}>
            <h3 className="font-extrabold">الكراسي</h3>
            <div className="grid grid-cols-3 gap-2"><Stat l="الإجمالي" v={s.seats_total} /><Stat l="متاح" v={s.seats_free} c={GRN} /><Stat l="محجوز" v={s.seats_taken} c={SKY} /></div>
            <Bar value={s.seats_taken} max={s.seats_total} color="bg-sky-500" />
            <div className="text-xs text-muted">{s.seats_blocked} كرسي مقفول · {s.seats_male} للشباب فقط · {s.seats_female} للبنات فقط</div>
          </div>
        )}

        <div className={`${card} p-5 space-y-4`}>
          <h3 className="font-extrabold">الإيرادات</h3>
          <div className="grid grid-cols-2 gap-2"><Stat l="مؤكد" v={money(s.revenue_approved)} c={GRN} /><Stat l="قيد المراجعة" v={money(s.revenue_pending)} c={AMB} /></div>
          <Bar value={s.revenue_approved} max={s.revenue_approved + s.revenue_pending} color="bg-emerald-500" />
        </div>

        <div className={`${card} p-5 space-y-4`}>
          <h3 className="font-extrabold">الحجوزات</h3>
          <div className="grid grid-cols-4 gap-2"><Stat l="بيدفعوا" v={s.awaiting} c="text-ink/80" /><Stat l="قيد المراجعة" v={s.pending} c={AMB} /><Stat l="مقبولة" v={s.approved} c={GRN} /><Stat l="مرفوضة" v={s.declined} c={RED} /></div>
        </div>

        <div className={`${card} p-5 space-y-3`}>
          <h3 className="font-extrabold">شباب / بنات</h3>
          <div className="grid grid-cols-2 gap-2"><Stat l="شباب" v={s.male_booked} c={SKY} /><Stat l="بنات" v={s.female_booked} c={PNK} /></div>
          <Bar value={s.male_booked} max={booked} color="bg-sky-500" />
        </div>

        <div className={`${card} p-5 space-y-4`}>
          <h3 className="font-extrabold">الدفعات</h3>
          <div className="space-y-2.5">
            {batches.map(([l, n, c]) => (
              <div key={l}><div className="flex justify-between text-sm mb-1"><span className="text-ink/80">{l}</span><b className="tabular-nums">{n}</b></div><Bar value={n} max={booked} color={c} /></div>
            ))}
            {s.batch_unknown > 0 && <div className="text-xs text-muted">{s.batch_unknown} من غير دفعة معروفة</div>}
          </div>
        </div>

        <div className={`${card} p-5 space-y-4`}>
          <h3 className="font-extrabold">الدخول</h3>
          <div className="grid grid-cols-4 gap-2"><Stat l="دخلوا" v={s.entered} c={GRN} /><Stat l="لسه" v={Math.max(0, s.approved - s.entered)} c={AMB} /><Stat l="سكان مكرر" v={s.scan_duplicate} c={RED} /><Stat l="مرفوض إجمالاً" v={s.scan_declined} c={RED} /></div>
          <Bar value={s.entered} max={s.approved} color="bg-emerald-500" />
        </div>
      </div>
    </div>
  )
}
