import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, ArrowLeftToLine, ArrowRightToLine, Ban, CheckCheck, Keyboard, ListOrdered, Mars, Trash2, Unlock, Venus } from 'lucide-react'
import LayoutBuilder from '../../components/LayoutBuilder'
import SeatMap, { HallPanel, seatView } from '../../components/SeatMap'
import StaffLayout from '../../components/StaffLayout'
import { confirmDialog, toast } from '../../components/feedback'
import { btnGhost, btnPrimary, card, FullLoader, inputCls, Spinner } from '../../components/ui'
import { errText, fetchSeats, rpc, type EventRow, type Restriction, type Seat } from '../../lib/api'
import { useLive } from '../../lib/live'
import { supabase } from '../../lib/supabase'
import { useNow } from '../../lib/time'

const SHORTCUTS: Array<[string, string]> = [
  ['كليك', 'اختيار كرسي (على الموبايل: كل كليك بيضيف/يشيل)'],
  ['Shift + كليك', 'اختيار كل الكراسي اللي بين آخر كرسي اخترته وده'],
  ['Ctrl + كليك', 'إضافة كرسي للمختار / شيله منه'],
  ['كليك على رقم الصف', 'اختيار الصف كله'],
  ['كليك على حرف البلوك', 'اختيار البلوك كله'],
  ['Ctrl + E', 'إضافة كرسي على يمين المختار'],
  ['Ctrl + Q', 'إضافة كرسي على شمال المختار'],
  ['Ctrl + A', 'اختيار كل الكراسي'],
  ['Delete', 'حذف الكراسي المختارة'],
  ['B / O', 'قفل / فتح المختار'],
  ['M / F / G', 'للشباب فقط / للبنات فقط / للكل'],
  ['Esc', 'إلغاء الاختيار'],
]

export default function Seats() {
  const { id } = useParams()
  const eventId = id || ''
  const now = useNow()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cap, setCap] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  const ev = useLive(async () => {
    const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single()
    if (error) throw error
    return data as EventRow
  }, [{ table: 'events', filter: `id=eq.${eventId}` }], 30000)
  const seatsLive = useLive(() => fetchSeats(eventId), [{ table: 'seats', filter: `event_id=eq.${eventId}` }], 8000)
  const seats = seatsLive.data || []

  const counts = useMemo(() => {
    const c = { free: 0, booked: 0, male: 0, female: 0, blocked: 0 }
    for (const s of seats) {
      const v = seatView(s, now)
      if (v === 'blocked') { c.blocked++; continue }
      if (v === 'free') c.free++; else c.booked++
      if (s.restriction === 'male') c.male++
      if (s.restriction === 'female') c.female++
    }
    return c
  }, [seats, now])

  // ---------- selection ----------
  const onSeat = (s: Seat, e: MouseEvent) => {
    const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch'
    const ctrl = e.ctrlKey || e.metaKey
    if (e.shiftKey && anchor.current) {
      const a = seats.findIndex((x) => x.id === anchor.current), b = seats.findIndex((x) => x.id === s.id)
      if (a >= 0 && b >= 0) {
        const range = seats.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id)
        setSel((cur) => new Set([...(ctrl ? cur : []), ...range]))
        return
      }
    }
    anchor.current = s.id
    setSel((cur) => {
      const n = new Set(ctrl || touch ? cur : [])
      if (cur.has(s.id) && (ctrl || touch || cur.size === 1)) n.delete(s.id); else n.add(s.id)
      return n
    })
  }
  const toggleGroup = (list: { id: string }[]) => setSel((cur) => {
    const n = new Set(cur); const all = list.every((s) => n.has(s.id))
    list.forEach((s) => (all ? n.delete(s.id) : n.add(s.id))); return n
  })

  // ---------- actions ----------
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast(errText(e), 'error') } finally { setBusy(false) }
  }

  const apply = (restriction: Restriction | null, blocked: boolean | null) => {
    if (!sel.size) return toast('اختار كراسي الأول', 'info')
    void run(async () => {
      const n = await rpc<number>('md_set_seats', { p_event: eventId, p_ids: [...sel], p_restriction: restriction, p_blocked: blocked })
      toast(n < sel.size ? `اتعدل ${n} كرسي — ${sel.size - n} محجوز ومتغيرش` : `اتعدل ${n} كرسي ✅`, n < sel.size ? 'info' : 'success')
      setSel(new Set()); await seatsLive.reload()
    })
  }
  const addSeats = (side: 'left' | 'right') => {
    if (!sel.size) return toast('اختار كرسي الأول وبعدها ضيف يمينه أو شماله', 'info')
    void run(async () => {
      const n = await rpc<number>('md_add_seats', { p_event: eventId, p_refs: [...sel], p_side: side })
      toast(`اتضاف ${n} كرسي على ${side === 'right' ? 'اليمين' : 'الشمال'} ✅`)
      setSel(new Set()); await seatsLive.reload()
    })
  }
  const delSeats = async () => {
    if (!sel.size) return toast('اختار كراسي الأول', 'info')
    if (!(await confirmDialog({ title: `تمسح ${sel.size} كرسي؟`, message: 'الكراسي المحجوزة مش هتتمسح.', confirmText: 'امسح', danger: true }))) return
    void run(async () => {
      const n = await rpc<number>('md_delete_seats', { p_event: eventId, p_ids: [...sel] })
      toast(n < sel.size ? `اتمسح ${n} — ${sel.size - n} محجوز ومتمسحش` : `اتمسح ${n} كرسي`, n < sel.size ? 'info' : 'success')
      setSel(new Set()); await seatsLive.reload()
    })
  }
  const renumber = async () => {
    if (!(await confirmDialog({ title: 'إعادة ترقيم الكراسي؟', message: 'الأرقام هتترتب من جديد (A و B و C صف ورا صف). لو فيه تذاكر اتصدرت، الطلاب لازم ينزلوها تاني.', confirmText: 'إعادة الترقيم', danger: true }))) return
    void run(async () => { await rpc('md_renumber_event', { p_event: eventId }); toast('اتعاد الترقيم ✅'); await seatsLive.reload() })
  }
  const saveCap = async () => {
    const v = (cap ?? '').trim()
    const { error } = await supabase.from('events').update({ max_bookings: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)) }).eq('id', eventId)
    if (error) return toast(errText(error), 'error')
    toast('اتحفظ الحد الأقصى ✅'); setCap(null); void ev.reload()
  }

  // keyboard shortcuts (by physical key, so they also work on an Arabic keyboard)
  const act = useRef({ addSeats, delSeats, apply, all: () => {}, clear: () => {} })
  act.current = { addSeats, delSeats, apply, all: () => setSel(new Set(seats.map((s) => s.id))), clear: () => setSel(new Set()) }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '')) return
      const mod = e.ctrlKey || e.metaKey
      const a = act.current
      if (mod && e.code === 'KeyE') { e.preventDefault(); a.addSeats('right') }
      else if (mod && e.code === 'KeyQ') { e.preventDefault(); a.addSeats('left') }
      else if (mod && e.code === 'KeyA') { e.preventDefault(); a.all() }
      else if (e.code === 'Escape') a.clear()
      else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); void a.delSeats() }
      else if (!mod && !e.shiftKey && !e.altKey) {
        if (e.code === 'KeyB') a.apply(null, true)
        else if (e.code === 'KeyO') a.apply(null, false)
        else if (e.code === 'KeyM') a.apply('male', null)
        else if (e.code === 'KeyF') a.apply('female', null)
        else if (e.code === 'KeyG') a.apply('any', null)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (ev.loading || seatsLive.loading) return <StaffLayout title="الكراسي" roles={['super_admin']}><FullLoader /></StaffLayout>
  const event = ev.data

  return (
    <StaffLayout title={event?.title || 'الكراسي'} roles={['super_admin']} wide
      actions={<Link to="/staff/events" className={btnGhost}><ArrowRight className="w-4 h-4" /> الإيفينتات</Link>}>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5 text-center">
        {([['متاح', counts.free, 'text-emerald-600 dark:text-emerald-300'], ['محجوز', counts.booked, 'text-ink'], ['للشباب', counts.male, 'text-sky-600 dark:text-sky-300'], ['للبنات', counts.female, 'text-pink-600 dark:text-pink-300'], ['مقفول', counts.blocked, 'text-muted']] as const).map(([l, n, c]) => (
          <div key={l} className={`${card} py-3`}><div className={`text-2xl font-black ${c}`}>{n}</div><div className="text-[11px] text-muted">{l}</div></div>
        ))}
      </div>

      <LayoutBuilder key={eventId} eventId={eventId} event={event} hasSeats={seats.length > 0}
        onApplied={() => { setSel(new Set()); void Promise.all([seatsLive.reload(), ev.reload()]) }} />

      <div className={`${card} p-4 mb-5 flex flex-wrap items-end gap-3`}>
        <div>
          <div className="text-sm font-bold mb-1">الحد الأقصى للحجوزات</div>
          <div className="flex items-center gap-2">
            <input className={`${inputCls} w-32 !py-2`} type="number" min={0} placeholder="كل الكراسي" value={cap ?? (event?.max_bookings ?? '')} onChange={(e) => setCap(e.target.value)} />
            <button className={btnPrimary} disabled={cap === null} onClick={saveCap}>حفظ</button>
          </div>
        </div>
        <div className="flex-1" />
        {seats.length > 0 && <button className={btnGhost} disabled={busy} onClick={renumber}><ListOrdered className="w-4 h-4" /> إعادة الترقيم</button>}
      </div>

      <div className={`${card} p-3 mb-3 flex flex-wrap items-center gap-2`}>
        <span className="text-sm text-ink/80 ml-2">المختار: <b className="text-emerald-700 dark:text-emerald-300">{sel.size}</b></span>
        <button className={btnGhost} disabled={busy} onClick={() => addSeats('right')} title="Ctrl+E"><ArrowRightToLine className="w-4 h-4" /> كرسي يمين</button>
        <button className={btnGhost} disabled={busy} onClick={() => addSeats('left')} title="Ctrl+Q"><ArrowLeftToLine className="w-4 h-4" /> كرسي شمال</button>
        <button className={btnGhost} disabled={busy} onClick={() => apply('male', null)}><Mars className="w-4 h-4 text-sky-600 dark:text-sky-300" /> للشباب</button>
        <button className={btnGhost} disabled={busy} onClick={() => apply('female', null)}><Venus className="w-4 h-4 text-pink-600 dark:text-pink-300" /> للبنات</button>
        <button className={btnGhost} disabled={busy} onClick={() => apply('any', null)}><CheckCheck className="w-4 h-4" /> للكل</button>
        <button className={btnGhost} disabled={busy} onClick={() => apply(null, true)}><Ban className="w-4 h-4 text-red-600 dark:text-red-300" /> قفل</button>
        <button className={btnGhost} disabled={busy} onClick={() => apply(null, false)}><Unlock className="w-4 h-4 text-emerald-600 dark:text-emerald-300" /> فتح</button>
        <button className={btnGhost} disabled={busy} onClick={delSeats}><Trash2 className="w-4 h-4 text-red-600 dark:text-red-300" /> حذف</button>
        <div className="flex-1" />
        <button className="text-xs text-muted hover:text-ink flex items-center gap-1" onClick={() => setHelp((h) => !h)}><Keyboard className="w-4 h-4" /> الاختصارات</button>
        {busy && <Spinner />}
      </div>
      {help && (
        <div className={`${card} p-4 mb-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm`}>
          {SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center gap-2"><kbd className="px-2 py-0.5 rounded-lg bg-ink/10 text-xs font-bold whitespace-nowrap" dir="ltr">{k}</kbd><span className="text-muted">{d}</span></div>)}
        </div>
      )}

      <HallPanel>
        {seats.length === 0 ? <p className="text-center text-slate-400 py-10">اعمل تصميم القاعة الأول من فوق.</p> : (
          <SeatMap admin seats={seats} now={now} selectedIds={sel} maxHeightRatio={0.72}
            onSeat={onSeat} onRow={toggleGroup} onSection={toggleGroup} />
        )}
      </HallPanel>
      <p className="text-xs text-muted mt-2 leading-relaxed">لو فيه حجوزات شغالة، الكراسي الجديدة بتاخد أرقام جديدة من غير ما الأرقام القديمة تتغير (عشان التذاكر اللي اتصدرت). استخدم «إعادة الترقيم» لو عايز ترتيب كامل.</p>
    </StaffLayout>
  )
}
