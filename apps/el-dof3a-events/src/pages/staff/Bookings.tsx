import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileSpreadsheet, FileText, Image as ImageIcon, RotateCcw, Search, Trash2, UserPlus, X } from 'lucide-react'
import EventPicker, { rememberedEvent } from '../../components/EventPicker'
import Modal from '../../components/Modal'
import StaffLayout from '../../components/StaffLayout'
import { confirmDialog, toast } from '../../components/feedback'
import { Badge, btnGhost, btnPrimary, card, FullLoader, inputCls, lightInputCls, Spinner } from '../../components/ui'
import { BATCH_AR, batchOf, errText, fetchSeats, rpc, type BookingStatus } from '../../lib/api'
import { purgeProofFiles } from '../../lib/cleanup'
import { useStaff } from '../../lib/staff'
import SeatMap, { HallPanel, seatView } from '../../components/SeatMap'
import { useNow } from '../../lib/time'
import { exportReservationsXlsx, printReservationsPdf, type ExportRow } from '../../lib/export'
import { pageAll, useLive } from '../../lib/live'
import { feedbackOk, feedbackTick } from '../../lib/sound'
import { supabase } from '../../lib/supabase'
import { formatCairo } from '../../lib/time'

interface Row {
  id: string; status: BookingStatus; national_id: string; amount: number; proof_path: string | null
  decline_reason: string | null; submitted_at: string | null; created_at: string; scanned_at: string | null
  students: { name: string; academic_no: string | null } | null; seats: { label: string } | null
}
const STATUS_AR: Record<string, string> = { awaiting_payment: 'بيدفع', pending: 'قيد المراجعة', approved: 'مقبول', declined: 'مرفوض' }
const TABS: Array<[string, string]> = [['pending', 'قيد المراجعة'], ['approved', 'مقبولة'], ['declined', 'مرفوضة'], ['awaiting_payment', 'بيدفعوا'], ['all', 'الكل']]

export default function Bookings() {
  const [eventId, setEventId] = useState(rememberedEvent())
  return (
    <StaffLayout title="الحجوزات" roles={['super_admin', 'reviewer']} wide actions={<EventPicker value={eventId} onChange={setEventId} />}>
      {eventId ? <Body eventId={eventId} /> : <FullLoader />}
    </StaffLayout>
  )
}

function Body({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState('pending')
  const [q, setQ] = useState('')
  const [proof, setProof] = useState<{ row: Row; url: string | null } | null>(null)
  const [declining, setDeclining] = useState<Row | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [withPending, setWithPending] = useState(false)
  const lastPending = useRef<number | null>(null)

  const { data, loading, connected, reload } = useLive(
    () => pageAll<Row>((from, to) => supabase.from('bookings')
      .select('id,status,national_id,amount,proof_path,decline_reason,submitted_at,created_at,scanned_at,students(name,academic_no),seats(label)')
      .eq('event_id', eventId).in('status', ['awaiting_payment', 'pending', 'approved', 'declined'])
      .order('created_at', { ascending: false }).range(from, to)),
    [{ table: 'bookings', filter: `event_id=eq.${eventId}` }], 10000)
  const rows = data || []

  // a new request arrived while this screen is open
  const pendingCount = rows.filter((r) => r.status === 'pending').length
  useEffect(() => {
    if (lastPending.current !== null && pendingCount > lastPending.current) { feedbackTick(); toast('وصل طلب حجز جديد 🔔', 'info') }
    lastPending.current = pendingCount
  }, [pendingCount])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [rows])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => (tab === 'all' || r.status === tab) && (!t ||
      r.national_id.includes(t) || (r.students?.name || '').toLowerCase().includes(t) || (r.students?.academic_no || '').toLowerCase().includes(t) || (r.seats?.label || '').toLowerCase() === t))
  }, [rows, tab, q])

  const review = async (r: Row, approve: boolean, why?: string) => {
    setBusyId(r.id)
    try {
      await rpc('md_review_booking', { p_booking: r.id, p_approve: approve, p_reason: why || null })
      feedbackOk(); toast(approve ? 'اتقبل ✅' : 'اترفض والكرسي رجع متاح', approve ? 'success' : 'info')
      setProof(null); setDeclining(null); setReason(''); void reload()
    } catch (e) { toast(errText(e), 'error'); void reload() } finally { setBusyId(null) }
  }

  const openProof = async (r: Row) => {
    setProof({ row: r, url: null })
    if (!r.proof_path) return
    const { data, error } = await supabase.storage.from('md-proofs').createSignedUrl(r.proof_path, 900)
    if (error) return toast(errText(error), 'error')
    setProof({ row: r, url: data.signedUrl })
  }

  const exportRows = (): ExportRow[] =>
    rows.filter((r) => r.status === 'approved' || (withPending && r.status === 'pending'))
      .map((r) => ({ name: r.students?.name || '', national_id: r.national_id, academic_no: r.students?.academic_no ?? null, batch: batchOf(r.students?.academic_no) ? BATCH_AR[batchOf(r.students?.academic_no)!] : '', seat: r.seats?.label ?? null, status: STATUS_AR[r.status] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))

  const eventTitle = 'الحجوزات'

  // ----- super-admin tools -----
  const { staff } = useStaff()
  const isSuper = staff?.role === 'super_admin'
  const [manual, setManual] = useState(false)

  const removeBooking = async (r: Row) => {
    if (!(await confirmDialog({ title: `تمسح حجز ${r.students?.name || ''}؟`, message: 'الحجز هيتمسح مع صورة الدفع والكرسي هيرجع متاح.', confirmText: 'امسح الحجز', danger: true }))) return
    setBusyId(r.id)
    try {
      const gone = await rpc<Array<{ id: string; proof_path: string | null }>>('md_delete_booking', { p_booking: r.id })
      await purgeProofFiles(gone)
      toast('اتمسح الحجز'); void reload()
    } catch (e) { toast(errText(e), 'error') } finally { setBusyId(null) }
  }
  const resetAll = async () => {
    if (!(await confirmDialog({ title: 'تصفير كل حجوزات الإيفينت؟', message: `هيتمسح ${rows.length} حجز + سجل السكان + كل صور الدفع، وكل الكراسي هترجع متاحة. مفيش رجوع.`, confirmText: 'صفّر كل حاجة', danger: true }))) return
    try {
      const gone = await rpc<Array<{ id: string; proof_path: string | null }>>('md_reset_event', { p_event: eventId })
      await purgeProofFiles(gone)
      toast('اتصفّرت الحجوزات'); void reload()
    } catch (e) { toast(errText(e), 'error') }
  }
  const doExport = (kind: 'x' | 'p') => {
    const list = exportRows()
    if (!list.length) return toast('مفيش حجوزات للتصدير', 'info')
    if (kind === 'x') exportReservationsXlsx(eventTitle, list)
    else if (!printReservationsPdf(eventTitle, list)) toast('اسمح بالنوافذ المنبثقة', 'error')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input className={`${inputCls} pr-10`} placeholder="بحث بالاسم / الرقم القومي / الأكاديمي / الكرسي" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-1.5 text-xs text-ink/80"><input type="checkbox" className="accent-emerald-600" checked={withPending} onChange={(e) => setWithPending(e.target.checked)} /> مع قيد المراجعة</label>
        <button className={btnGhost} onClick={() => doExport('x')}><FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-300" /> Excel</button>
        <button className={btnGhost} onClick={() => doExport('p')}><FileText className="w-4 h-4 text-red-600 dark:text-red-300" /> PDF</button>
        {isSuper && <button className={btnPrimary} onClick={() => setManual(true)}><UserPlus className="w-4 h-4" /> حجز يدوي</button>}
        {isSuper && <button className={btnGhost} onClick={resetAll}><RotateCcw className="w-4 h-4 text-red-600 dark:text-red-300" /> تصفير الحجوزات</button>}
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-semibold ${tab === k ? 'bg-emerald-600 text-white' : 'bg-ink/5 text-ink/80'}`}>{l} <span className="opacity-70">{counts[k] || 0}</span></button>
        ))}
      </div>

      {loading ? <FullLoader /> : shown.length === 0 ? <div className={`${card} p-10 text-center text-muted`}>مفيش حجوزات هنا</div> : (
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className={`${card} p-4 flex flex-wrap items-center gap-3`}>
              <div className="w-14 text-center"><div className="text-[10px] text-muted">كرسي</div><div className="text-xl font-black text-emerald-700 dark:text-emerald-300">{r.seats?.label || '—'}</div></div>
              <div className="flex-1 min-w-[12rem]">
                <div className="font-bold">{r.students?.name}</div>
                <div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{r.national_id} · {r.students?.academic_no || '—'}{batchOf(r.students?.academic_no) ? ` · ${BATCH_AR[batchOf(r.students?.academic_no)!]}` : ''}</div>
                <div className="text-xs text-muted mt-0.5">{r.amount} ج · {formatCairo(r.submitted_at || r.created_at)}</div>
                {r.status === 'declined' && r.decline_reason && <div className="text-xs text-red-600 dark:text-red-300 mt-0.5">السبب: {r.decline_reason}</div>}
              </div>
              <Badge tone={r.status === 'approved' ? 'green' : r.status === 'declined' ? 'red' : r.status === 'pending' ? 'amber' : 'zinc'}>{STATUS_AR[r.status]}{r.scanned_at ? ' · دخل' : ''}</Badge>
              <div className="flex gap-2">
                {isSuper && <button disabled={busyId === r.id} onClick={() => removeBooking(r)} className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 disabled:opacity-50" title="مسح الحجز"><Trash2 className="w-4 h-4" /></button>}
                {r.proof_path && <button className={btnGhost} onClick={() => openProof(r)}><ImageIcon className="w-4 h-4" /> الإيصال</button>}
                {r.status === 'pending' && (<>
                  <button disabled={busyId === r.id} onClick={() => review(r, true)} className="px-3 py-2 rounded-xl bg-emerald-500 text-white font-bold flex items-center gap-1 disabled:opacity-50">{busyId === r.id ? <Spinner className="w-4 h-4" /> : <Check className="w-4 h-4" />} قبول</button>
                  <button disabled={busyId === r.id} onClick={() => { setDeclining(r); setReason('') }} className="px-3 py-2 rounded-xl bg-red-500/20 text-red-600 dark:text-red-300 font-bold flex items-center gap-1 disabled:opacity-50"><X className="w-4 h-4" /> رفض</button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {manual && <ManualBooking defaultEventId={eventId} onClose={() => setManual(false)} onDone={() => { setManual(false); void reload() }} />}

      {proof && (
        <Modal title={`إيصال ${proof.row.students?.name || ''}`} maxWidth="max-w-lg" onClose={() => setProof(null)}
          footer={proof.row.status === 'pending' ? (
            <div className="flex gap-2">
              <button onClick={() => review(proof.row, true)} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold">قبول</button>
              <button onClick={() => { setDeclining(proof.row); setProof(null) }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold">رفض</button>
            </div>) : undefined}>
          <div className="text-sm text-muted mb-3">المبلغ المطلوب: <b>{proof.row.amount} جنيه</b> · كرسي <b>{proof.row.seats?.label}</b></div>
          {proof.url ? <img src={proof.url} alt="إيصال" className="w-full rounded-xl border" /> : <div className="h-40 flex items-center justify-center text-muted"><Spinner className="w-8 h-8" /></div>}
        </Modal>
      )}

      {declining && (
        <Modal title="سبب الرفض" maxWidth="max-w-md" onClose={() => setDeclining(null)}
          footer={<button disabled={busyId === declining.id} onClick={() => review(declining, false, reason)} className="w-full py-3 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50">تأكيد الرفض</button>}>
          <div className="light-modal">
            <p className="text-sm text-muted mb-2">الكرسي هيرجع متاح فوراً والطالب هيشوف السبب.</p>
            <textarea className={lightInputCls} rows={3} placeholder="مثال: المبلغ غير مطابق / الصورة غير واضحة" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  )
}

interface Found { national_id: string; name: string; academic_no: string | null }

/** super admin: book someone directly — counts as reviewed + paid + approved; blocked chairs can be picked too */
function ManualBooking({ defaultEventId, onClose, onDone }: { defaultEventId: string; onClose: () => void; onDone: () => void }) {
  const now = useNow()
  const [eventId, setEventId] = useState(defaultEventId)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Found[]>([])
  const [student, setStudent] = useState<Found | null>(null)
  const [seat, setSeat] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const events = useLive(async () => {
    const { data, error } = await supabase.from('events').select('id,title,booking_mode').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as Array<{ id: string; title: string; booking_mode: 'seats' | 'names' }>
  }, [], 60000)
  const ev = (events.data || []).find((e) => e.id === eventId)
  const seatsMode = ev?.booking_mode === 'seats'

  const seatsLive = useLive(async () => (seatsMode ? fetchSeats(eventId) : []), [{ table: 'seats', filter: `event_id=eq.${eventId}` }], 8000)
  useEffect(() => { setSeat(null); void seatsLive.reload() }, [eventId, seatsMode])

  useEffect(() => {
    const t = window.setTimeout(async () => {
      const term = q.replace(/[,()%*]/g, ' ').trim()
      if (term.length < 2) { setResults([]); return }
      const { data } = await supabase.from('students').select('national_id,name,academic_no')
        .or(`name.ilike.%${term}%,national_id.ilike.%${term}%,academic_no.ilike.%${term}%`).limit(8)
      setResults((data || []) as Found[])
    }, 250)
    return () => window.clearTimeout(t)
  }, [q])

  const submit = async () => {
    if (!student || (seatsMode && !seat)) return
    setBusy(true)
    try {
      await rpc('md_admin_book', { p_event: eventId, p_nid: student.national_id, p_seat: seatsMode ? seat : null })
      feedbackOk(); toast('اتسجل الحجز ✅'); onDone()
    } catch (e) { toast(errText(e), 'error'); void seatsLive.reload() } finally { setBusy(false) }
  }

  const picked = (seatsLive.data || []).find((s) => s.id === seat)
  return (
    <Modal title="حجز يدوي" maxWidth="max-w-3xl" full onClose={onClose}
      footer={<div className="flex items-center gap-3">
        <div className="flex-1 text-sm text-muted">{student ? <b className="text-ink">{student.name}</b> : 'اختار طالب'}{seatsMode ? (picked ? <> · كرسي <b className="text-ink">{picked.label}</b></> : ' · واختار كرسي') : ''}</div>
        <button className={btnPrimary} disabled={busy || !student || (seatsMode && !seat)} onClick={submit}>{busy ? <Spinner /> : <Check className="w-5 h-5" />} تسجيل الحجز (مدفوع ومؤكد)</button>
      </div>}>
      <div className="space-y-4">
        <label className="block"><span className="block text-sm font-semibold mb-1">الإيفينت</span>
          <select className={lightInputCls} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select></label>

        <div>
          <span className="block text-sm font-semibold mb-1">الطالب</span>
          {student ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex-1"><div className="font-bold">{student.name}</div><div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{student.national_id} · {student.academic_no || '—'}</div></div>
              <button className="text-xs underline text-muted hover:text-ink" onClick={() => setStudent(null)}>تغيير</button>
            </div>
          ) : (<>
            <input className={lightInputCls} placeholder="ابحث بالاسم / الرقم القومي / الرقم الأكاديمي" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {results.length > 0 && (
              <div className="mt-2 rounded-2xl border border-line divide-y divide-line overflow-hidden">
                {results.map((r) => (
                  <button key={r.national_id} className="w-full text-right px-4 py-2.5 hover:bg-ink/5" onClick={() => { setStudent(r); setQ(''); setResults([]) }}>
                    <div className="font-semibold">{r.name}</div><div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{r.national_id} · {r.academic_no || '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </>)}
        </div>

        {seatsMode && (
          <div>
            <span className="block text-sm font-semibold mb-1">الكرسي</span>
            <HallPanel>
              {seatsLive.loading ? <FullLoader /> : (
                <SeatMap admin seats={seatsLive.data || []} now={now} selectedIds={new Set(seat ? [seat] : [])} maxHeightRatio={0.55}
                  minScale={typeof window !== 'undefined' && window.innerWidth < 640 ? 0.9 : 0}
                  onSeat={(s) => { const v = seatView(s, now); if (v === 'taken' || v === 'held') return toast('الكرسي ده محجوز', 'info'); setSeat((c) => (c === s.id ? null : s.id)) }} />
              )}
            </HallPanel>
          </div>
        )}
      </div>
    </Modal>
  )
}
