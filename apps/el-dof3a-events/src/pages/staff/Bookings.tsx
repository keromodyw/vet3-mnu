import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Check, FileSpreadsheet, FileText, Image as ImageIcon, Plus, RotateCcw, Search, Trash2, UserPlus, X } from 'lucide-react'
import EventPicker, { rememberedEvent } from '../../components/EventPicker'
import Modal from '../../components/Modal'
import StaffLayout from '../../components/StaffLayout'
import { confirmDialog, toast } from '../../components/feedback'
import { Badge, btnGhost, btnPrimary, card, FullLoader, inputCls, lightInputCls, Spinner } from '../../components/ui'
import { BATCH_AR, batchOf, errText, rpc, type BookingStatus, type Seat } from '../../lib/api'
import { purgeProofFiles } from '../../lib/cleanup'
import { useStaff } from '../../lib/staff'
import SeatMap, { HallPanel, seatView } from '../../components/SeatMap'
import { useNow } from '../../lib/time'
import { exportReservationsXlsx, printReservationsPdf, type ExportRow } from '../../lib/export'
import { pageAll, useLive } from '../../lib/live'
import { useLiveSeats } from '../../lib/liveSeats'
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

const MAX_BULK = 300
const SHORTCUTS = 'كليك = اختيار كرسي · Shift+كليك = من آخر كرسي لحد ده · Ctrl+كليك = إضافة/شيل · كليك على رقم الصف أو حرف البلوك = الصف/البلوك كله'

/** typed Arabic letters match every spelling of them (ا أ إ آ · ى ي · ة ه), so the search finds the name however it was typed */
const fuzzyArabic = (t: string) => t.replace(/[اأإآ]/g, '_').replace(/[يى]/g, '_').replace(/[ةه]/g, '_')

/** super admin: book someone directly — counts as reviewed + paid + approved; blocked chairs can be picked too.
 *  One student + one chair, or MANY students + the same number of chairs (bulk) in one go. */
function ManualBooking({ defaultEventId, onClose, onDone }: { defaultEventId: string; onClose: () => void; onDone: () => void }) {
  const now = useNow()
  const [eventId, setEventId] = useState(defaultEventId)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  const [students, setStudents] = useState<Found[]>([])
  const [dupes, setDupes] = useState<Set<string>>(new Set())
  const [paste, setPaste] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const events = useLive(async () => {
    const { data, error } = await supabase.from('events').select('id,title,booking_mode').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as Array<{ id: string; title: string; booking_mode: 'seats' | 'names' }>
  }, [], 60000)
  const ev = (events.data || []).find((e) => e.id === eventId)
  const seatsMode = ev?.booking_mode === 'seats'

  const seatsLive = useLiveSeats(eventId, seatsMode)
  useEffect(() => { setSel(new Set()); anchor.current = null; void seatsLive.reload() }, [eventId, seatsMode])

  // ---------- fast search: only the column that makes sense, 120 ms debounce, cache, stale answers ignored ----------
  const cache = useRef(new Map<string, Found[]>())
  const seq = useRef(0)
  useEffect(() => {
    const term = q.replace(/[,()%*\\]/g, ' ').trim()
    if (term.length < 2) { seq.current++; setResults([]); setSearching(false); return }
    const hit = cache.current.get(term)
    if (hit) { setResults(hit); setSearching(false); return }
    setSearching(true)
    const my = ++seq.current
    const t = window.setTimeout(async () => {
      const digits = /^[0-9]+$/.test(term)
      const base = supabase.from('students').select('national_id,name,academic_no').limit(10)
      const { data } = await (digits ? base.or(`national_id.ilike.%${term}%,academic_no.ilike.%${term}%`) : base.ilike('name', `%${fuzzyArabic(term)}%`))
      if (my !== seq.current) return                          // a newer search already started
      const list = (data || []) as Found[]
      if (cache.current.size > 200) cache.current.clear()
      cache.current.set(term, list)
      setResults(list); setSearching(false)
    }, 120)
    return () => window.clearTimeout(t)
  }, [q])

  const addStudent = (r: Found) => {
    setStudents((cur) => {
      if (cur.some((x) => x.national_id === r.national_id)) { toast('الطالب ده مضاف بالفعل', 'info'); return cur }
      if (cur.length >= MAX_BULK) { toast(`أقصى عدد ${MAX_BULK} طالب في المرة`, 'info'); return cur }
      return [...cur, r]
    })
    setQ(''); setResults([]); input.current?.focus()
  }
  const removeStudent = (nid: string) => setStudents((cur) => cur.filter((x) => x.national_id !== nid))

  // paste many national / academic numbers at once
  const importPaste = async () => {
    const tokens = [...new Set((paste || '').split(/[\s,;،]+/).map((x) => x.trim()).filter(Boolean))]
    const nids = tokens.filter((t) => /^[0-9]{14}$/.test(t)), acads = tokens.filter((t) => /^[0-9]{8}$/.test(t))
    if (!nids.length && !acads.length) return toast('الصق أرقام قومية (14 رقم) أو أكاديمية (8 أرقام) — رقم في كل سطر', 'info')
    const found: Found[] = []
    for (let i = 0; i < nids.length; i += 100) {
      const { data } = await supabase.from('students').select('national_id,name,academic_no').in('national_id', nids.slice(i, i + 100)); found.push(...((data || []) as Found[]))
    }
    for (let i = 0; i < acads.length; i += 100) {
      const { data } = await supabase.from('students').select('national_id,name,academic_no').in('academic_no', acads.slice(i, i + 100)); found.push(...((data || []) as Found[]))
    }
    let added = 0
    setStudents((cur) => {
      const have = new Set(cur.map((x) => x.national_id)); const out = [...cur]
      for (const f of found) if (!have.has(f.national_id) && out.length < MAX_BULK) { have.add(f.national_id); out.push(f); added++ }
      return out
    })
    toast(`اتضاف ${added} طالب${tokens.length > added ? ` · ${tokens.length - added} مش موجود / مكرر` : ''}`, added ? 'success' : 'info')
    setPaste(null)
  }

  // students who already hold a pending / approved booking can't be booked again
  const nidsKey = students.map((x) => x.national_id).join(',')
  useEffect(() => {
    if (!students.length) { setDupes(new Set()); return }
    let dead = false
    void (async () => {
      const { data } = await supabase.from('bookings').select('national_id').eq('event_id', eventId).in('status', ['pending', 'approved']).in('national_id', students.map((x) => x.national_id))
      if (!dead) setDupes(new Set((data || []).map((r: { national_id: string }) => r.national_id)))
    })()
    return () => { dead = true }
  }, [nidsKey, eventId])

  // ---------- seats: click / shift / ctrl / whole row / whole block ----------
  const allSeats = seatsLive.data || []
  const avail = (s: Seat) => { const v = seatView(s, now); return v !== 'taken' && v !== 'held' }
  const ordered = useMemo(() => allSeats.filter((s) => sel.has(s.id) && avail(s)), [allSeats, sel, now])      // reading order: row → block → chair
  const onSeat = (s: Seat, e: MouseEvent) => {
    if (!avail(s)) return toast('الكرسي ده محجوز', 'info')
    const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch'
    const ctrl = e.ctrlKey || e.metaKey
    const additive = ctrl || touch || students.length > 1
    if (e.shiftKey && anchor.current) {
      const a = allSeats.findIndex((x) => x.id === anchor.current), b = allSeats.findIndex((x) => x.id === s.id)
      if (a >= 0 && b >= 0) {
        const range = allSeats.slice(Math.min(a, b), Math.max(a, b) + 1).filter(avail).map((x) => x.id)
        setSel((cur) => new Set([...(additive ? cur : []), ...range]))
        return
      }
    }
    anchor.current = s.id
    setSel((cur) => {
      const n = new Set(additive ? cur : [])
      if (cur.has(s.id) && (additive || cur.size === 1)) n.delete(s.id); else n.add(s.id)
      return n
    })
  }
  const toggleGroup = (list: Seat[]) => setSel((cur) => {
    const free = list.filter(avail)
    const n = new Set(cur); const all = free.length > 0 && free.every((s) => n.has(s.id))
    free.forEach((s) => (all ? n.delete(s.id) : n.add(s.id))); return n
  })

  // ---------- submit ----------
  const need = students.length, have = ordered.length
  const hasDupes = students.some((x) => dupes.has(x.national_id))
  const match = !seatsMode || need === have
  const canSubmit = !busy && need > 0 && match && !hasDupes
  const seatOf = (i: number) => (seatsMode ? ordered[i] : undefined)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      if (students.length === 1) {
        await rpc('md_admin_book', { p_event: eventId, p_nid: students[0].national_id, p_seat: seatsMode ? ordered[0].id : null })
      } else {
        await rpc<number>('md_admin_book_many', { p_event: eventId, p_pairs: students.map((st, i) => ({ nid: st.national_id, seat: seatsMode ? ordered[i].id : null })) })
      }
      feedbackOk(); toast(need > 1 ? `اتسجل ${need} حجز ✅` : 'اتسجل الحجز ✅'); onDone()
    } catch (e) { toast(errText(e), 'error'); void seatsLive.reload() } finally { setBusy(false) }
  }

  return (
    <Modal title="حجز يدوي" maxWidth="max-w-5xl" full onClose={onClose}
      footer={<div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[12rem] text-sm text-muted">
          طلاب <b className="text-ink">{need}</b>{seatsMode && <> · كراسي <b className={match ? 'text-ink' : 'text-red-600 dark:text-red-300'}>{have}</b></>}
          {seatsMode && need > 0 && !match && <span className="text-red-600 dark:text-red-300"> · {have < need ? `ناقص ${need - have} كرسي` : `زيادة ${have - need} كرسي`}</span>}
          {hasDupes && <span className="text-red-600 dark:text-red-300"> · فيه طلاب حاجزين بالفعل</span>}
        </div>
        <button className={btnPrimary} disabled={!canSubmit} onClick={submit}>{busy ? <Spinner /> : <Check className="w-5 h-5" />} {need > 1 ? `تسجيل ${need} حجز` : 'تسجيل الحجز'} (مدفوع ومؤكد)</button>
      </div>}>
      <div className="space-y-4">
        <label className="block"><span className="block text-sm font-semibold mb-1">الإيفينت</span>
          <select className={lightInputCls} value={eventId} onChange={(e) => { setEventId(e.target.value); setStudents([]) }}>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select></label>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">الطلاب {need > 0 && <span className="text-muted font-normal">({need})</span>}</span>
            <div className="flex items-center gap-3 text-xs">
              <button className="underline text-muted hover:text-ink" onClick={() => setPaste(paste === null ? '' : null)}>لصق أرقام كتير</button>
              {need > 0 && <button className="underline text-muted hover:text-ink" onClick={() => setStudents([])}>مسح الكل</button>}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input ref={input} className={`${lightInputCls} pr-10`} placeholder="ابحث بالاسم / الرقم القومي / الرقم الأكاديمي — كليك أو Enter يضيف الطالب" value={q} autoFocus
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); addStudent(results[0]) } }} />
            {searching && <Spinner className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />}
          </div>
          {results.length > 0 && (
            <div className="mt-2 rounded-2xl border border-line divide-y divide-line overflow-hidden">
              {results.map((r) => {
                const added = students.some((x) => x.national_id === r.national_id)
                return (
                  <button key={r.national_id} disabled={added} className="w-full text-right px-4 py-2 hover:bg-ink/5 disabled:opacity-50 flex items-center gap-3" onClick={() => addStudent(r)}>
                    <div className="flex-1 min-w-0"><div className="font-semibold truncate">{r.name}</div><div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{r.national_id} · {r.academic_no || '—'}</div></div>
                    {added ? <Check className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-muted" />}
                  </button>
                )
              })}
            </div>
          )}
          {!searching && q.trim().length >= 2 && results.length === 0 && <div className="mt-2 text-xs text-muted">مفيش نتيجة</div>}
          {paste !== null && (
            <div className="mt-2 space-y-2">
              <textarea className={lightInputCls} rows={4} dir="ltr" placeholder={'الصق رقم قومي (14 رقم) أو أكاديمي (8 أرقام) — رقم في كل سطر'} value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button className={btnGhost} onClick={importPaste}><Plus className="w-4 h-4" /> إضافة</button>
            </div>
          )}

          {need > 0 && (
            <div className="mt-3 max-h-56 overflow-y-auto rounded-2xl border border-line divide-y divide-line">
              {students.map((st, i) => {
                const seat = seatOf(i)
                const dupe = dupes.has(st.national_id)
                return (
                  <div key={st.national_id} className={`flex items-center gap-3 px-3 py-2 ${dupe ? 'bg-red-500/10' : ''}`}>
                    <span className="w-6 text-center text-xs text-muted tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{st.name}</div><div className="text-[11px] text-muted" dir="ltr" style={{ textAlign: 'right' }}>{st.national_id} · {st.academic_no || '—'}{dupe ? ' · محجوز بالفعل' : ''}</div></div>
                    {seatsMode && <span className={`min-w-[3.5rem] text-center px-2 py-1 rounded-lg text-sm font-black ${seat ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-ink/5 text-muted'}`} dir="ltr">{seat ? seat.label : '—'}</span>}
                    <button className="p-1.5 rounded-lg text-muted hover:bg-ink/10 hover:text-ink" onClick={() => removeStudent(st.national_id)} aria-label="شيل"><X className="w-4 h-4" /></button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {seatsMode && (
          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-sm font-semibold">الكراسي {have > 0 && <span className="text-muted font-normal">({have})</span>}</span>
              {sel.size > 0 && <button className="text-xs underline text-muted hover:text-ink" onClick={() => setSel(new Set())}>إلغاء الاختيار</button>}
            </div>
            <p className="text-[11px] text-muted mb-2 leading-relaxed">{SHORTCUTS}. الكراسي بتتوزع على الطلاب بالترتيب (من الأمام للخلف، ومن الشمال لليمين).</p>
            <HallPanel>
              {seatsLive.loading ? <FullLoader /> : (
                <SeatMap admin seats={allSeats} now={now} selectedIds={sel} maxHeightRatio={0.55}
                  minScale={typeof window !== 'undefined' && window.innerWidth < 640 ? 0.9 : 0}
                  onSeat={onSeat} onRow={toggleGroup} onSection={toggleGroup} />
              )}
            </HallPanel>
          </div>
        )}
      </div>
    </Modal>
  )
}
