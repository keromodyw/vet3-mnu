import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Lock, Maximize, Move, ZoomIn, ZoomOut } from 'lucide-react'
import type { Gender, Seat } from '../lib/api'
import { sectionKeys } from '../lib/layout'

type View = 'free' | 'held' | 'taken' | 'blocked'
export type Mark = 'pending' | 'approved' | 'entered'
export const seatView = (s: Seat, now: number): View =>
  s.blocked ? 'blocked'
  : s.state === 'taken' ? 'taken'
  : s.state === 'held' && s.held_until && new Date(s.held_until).getTime() >= now ? 'held'
  : 'free'

const SEAT = 36, GAP = 4, AISLE = 28, LABEL = 24, MAXK = 5

/** a real cinema chair: backrest, cushion and two armrests */
function Chair({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={`absolute inset-0 w-full h-full fill-current transition-colors ${className}`}>
      <rect x="9" y="2" width="22" height="19" rx="8" />
      <rect x="9" y="2" width="22" height="19" rx="8" fill="#000" fillOpacity=".12" />
      <rect x="6" y="19" width="28" height="15" rx="5" />
      <rect x="1" y="14" width="7" height="21" rx="3.5" />
      <rect x="1" y="14" width="7" height="21" rx="3.5" fill="#000" fillOpacity=".25" />
      <rect x="32" y="14" width="7" height="21" rx="3.5" />
      <rect x="32" y="14" width="7" height="21" rx="3.5" fill="#000" fillOpacity=".25" />
      <rect x="8" y="35.5" width="24" height="2.5" rx="1.25" fill="#000" fillOpacity=".3" />
    </svg>
  )
}

function Screen({ width }: { width: number }) {
  return (
    <div className="mx-auto mb-5 select-none" style={{ width }}>
      <svg viewBox="0 0 400 74" className="w-full" aria-hidden>
        <defs>
          <linearGradient id="eld-scr" x1="0" x2="1"><stop offset="0" stopColor="#475569" /><stop offset=".5" stopColor="#f8fafc" /><stop offset="1" stopColor="#475569" /></linearGradient>
          <linearGradient id="eld-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2e8f0" stopOpacity=".28" /><stop offset="1" stopColor="#e2e8f0" stopOpacity="0" /></linearGradient>
        </defs>
        <path d="M14 30 Q200 -2 386 30 L412 74 L-12 74 Z" fill="url(#eld-beam)" />
        <path d="M10 30 Q200 -6 390 30 L390 37 Q200 1 10 37 Z" fill="url(#eld-scr)" />
      </svg>
      <div className="text-center text-[10px] tracking-[.45em] text-slate-500 -mt-1">SCREEN · الشاشة</div>
    </div>
  )
}

const MARK_CLS: Record<Mark, string> = { pending: 'text-amber-500', approved: 'text-violet-500', entered: 'text-sky-400' }

interface Props {
  seats: Seat[]
  now: number
  /** student mode: viewer's gender (seats meant for the other gender just look booked) */
  gender?: Gender
  mineId?: string | null
  selectedIds?: Set<string>
  onSeat?: (s: Seat, e: RMouseEvent) => void
  onRow?: (rowSeats: Seat[]) => void
  onSection?: (sectionSeats: Seat[]) => void
  /** admin: shows blocked chairs + gender restrictions, every chair is clickable */
  admin?: boolean
  /** reports: display only, coloured by `marks` */
  readOnly?: boolean
  marks?: Record<string, Mark>
  maxHeightRatio?: number
  /** never shrink the seats below this scale — the map becomes pannable instead of unreadable (used by the student picker) */
  minScale?: number
  /** block key to bring into view (or 'ALL'). The hall itself never changes — the view glides to that block */
  focus?: string
}

/** Always fits the screen; two-finger pinch / ctrl+wheel / buttons zoom, drag pans. Sits on a dark HallPanel. */
export default function SeatMap({ seats, now, gender, mineId, selectedIds, onSeat, onRow, onSection, admin, readOnly, marks, maxHeightRatio = 0.6, minScale = 0, focus }: Props) {
  // blocks come from the data (any letters, any order), rows from row_no, aisles from gaps in `pos`
  const { rows, blocks, maxPos } = useMemo(() => {
    const maxPos: Record<string, number> = {}
    const byRow = new Map<number, Record<string, Seat[]>>()
    for (const s of seats) {
      if (!byRow.has(s.row_no)) byRow.set(s.row_no, {})
      const row = byRow.get(s.row_no)!
      ;(row[s.section] ||= []).push(s)
      maxPos[s.section] = Math.max(maxPos[s.section] || 0, s.pos)
    }
    const blocks = sectionKeys(seats)
    const rows = [...byRow.entries()].sort(([a], [b]) => a - b).map(([no, by]) => {
      for (const k of blocks) (by[k] ||= []).sort((a, b) => a.pos - b.pos)
      return { no, by }
    })
    return { rows, blocks, maxPos }
  }, [seats])
  const secW = (k: string) => Math.max(SEAT, (maxPos[k] || 0) * (SEAT + GAP) - GAP)
  const mid = (blocks.length - 1) / 2
  // the whole hall, in px: labels + aisles + blocks (the screen is sized from this, so it is part of the fixed hall)
  const hallW = 2 * LABEL + (blocks.length + 1) * AISLE + blocks.reduce((n, b) => n + secW(b), 0)
  const screenW = Math.round(Math.min(640, Math.max(220, hallW * 0.8)))
  // the outer blocks hug the middle aisle and grow outwards; the middle block grows both ways
  const justify = (i: number) => (blocks.length === 1 || i === mid ? 'justify-center' : i < mid ? 'justify-end' : 'justify-start')

  // ----- fit + zoom + pan -----
  const wrap = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, nw: 320, nh: 240, ok: false })
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view

  useLayoutEffect(() => {
    const measure = () => {
      if (!wrap.current || !inner.current) return
      setSize({ w: wrap.current.clientWidth, nw: inner.current.offsetWidth || 1, nh: inner.current.offsetHeight || 1, ok: true })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrap.current) ro.observe(wrap.current)
    if (inner.current) ro.observe(inner.current)
    return () => ro.disconnect()
  }, [rows.length, seats.length])

  const viewportH = typeof window !== 'undefined' ? (window.visualViewport?.height || window.innerHeight) : 800
  const maxH = Math.max(220, viewportH * maxHeightRatio)
  const fitAll = Math.min(1.5, Math.max(0.05, Math.min(size.w / size.nw, maxH / size.nh)))
  const fit = Math.max(fitAll, Math.min(1.5, minScale))       // readable seats beat "everything on one screen"
  const kMin = fitAll / fit                                   // the zoom level that shows the whole hall
  const boxH = Math.min(Math.ceil(size.nh * fit) + 6, Math.ceil(maxH) + 6)
  const fitRef = useRef(fit); fitRef.current = fit
  const kMinRef = useRef(kMin); kMinRef.current = kMin

  const clamp = (k: number, x: number, y: number) => {
    const s = fitRef.current * k
    const mx = Math.max(0, (size.nw * s - size.w) / 2)         // only pan when the map is bigger than the box
    const my = Math.max(0, (size.nh * s - boxH) / 2)
    return { k, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) }
  }
  const centre = () => { const r = wrap.current!.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } }

  // ----- focus: the seats never move, the view glides to the chosen block -----
  const [anim, setAnim] = useState(false)
  const applied = useRef('ALL')
  const homed = useRef(false)
  useEffect(() => {
    if (!size.ok) return
    if (!homed.current) { homed.current = true; setView(clamp(1, 0, 1e9)); return }   // first view: the front rows, right under the screen
    const f = focus || 'ALL'
    if (applied.current === f || !size.w) return
    applied.current = f
    setAnim(true)
    const bi = blocks.indexOf(f)
    if (f === 'ALL' || bi < 0) { setView(clamp(1, 0, 1e9)); return }
    const total = hallW
    let left = LABEL + AISLE
    for (let j = 0; j < bi; j++) left += secW(blocks[j]) + AISLE
    const du = left + secW(f) / 2 - total / 2                  // block centre, measured from the hall centre
    const want = Math.min(1.6, size.w / (secW(f) + 2 * LABEL))  // zoom so the block fills the width
    const k = Math.min(MAXK, Math.max(kMinRef.current, minScale > 0 ? 1 : 0, want / fitRef.current))
    setView(clamp(k, -du * fitRef.current * k, viewRef.current.y))
  })

  // the "drag / pinch" tip goes away the moment the student touches the map (or after a few seconds)
  const [touched, setTouched] = useState(false)
  const touchedRef = useRef(false)
  const touchOnce = () => { if (!touchedRef.current) { touchedRef.current = true; setTouched(true) } }
  useEffect(() => {
    if (touched) return
    const t = window.setTimeout(() => setTouched(true), 9000)
    return () => window.clearTimeout(t)
  }, [touched])

  const zoomBy = (f: number, px?: number, py?: number) => {
    touchOnce()
    setAnim(false)
    const v = viewRef.current
    const k = Math.min(MAXK, Math.max(kMinRef.current, v.k * f))
    const { cx, cy } = centre()
    const mx = (px ?? cx) - cx, my = (py ?? cy) - cy
    const s0 = fitRef.current * v.k, s1 = fitRef.current * k
    const ux = (mx - v.x) / s0, uy = (my - v.y) / s0
    setView(clamp(k, mx - ux * s1, my - uy * s1))
  }

  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const g = useRef<{ mode: 'pan' | 'pinch'; sx: number; sy: number; v0: { k: number; x: number; y: number }; d0: number; ux: number; uy: number } | null>(null)
  const moved = useRef(false)

  const startPinch = () => {
    const [a, b] = [...ptrs.current.values()]
    const { cx, cy } = centre()
    const v = viewRef.current, s = fitRef.current * v.k
    const mx = (a.x + b.x) / 2 - cx, my = (a.y + b.y) / 2 - cy
    g.current = { mode: 'pinch', sx: 0, sy: 0, v0: v, d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), ux: (mx - v.x) / s, uy: (my - v.y) / s }
    moved.current = true
    touchOnce()
  }
  const onDown = (e: RPointerEvent) => {
    if (anim) setAnim(false)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 1) { moved.current = false; g.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, v0: viewRef.current, d0: 0, ux: 0, uy: 0 } }
    else if (ptrs.current.size === 2) startPinch()
  }
  const onMove = (e: RPointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const gg = g.current
    if (!gg) return
    if (gg.mode === 'pinch' && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()]
      const k = Math.min(MAXK, Math.max(kMinRef.current, gg.v0.k * (Math.hypot(a.x - b.x, a.y - b.y) / gg.d0)))
      const { cx, cy } = centre()
      const s = fitRef.current * k
      setView(clamp(k, (a.x + b.x) / 2 - cx - gg.ux * s, (a.y + b.y) / 2 - cy - gg.uy * s))
    } else if (gg.mode === 'pan') {
      const dx = e.clientX - gg.sx, dy = e.clientY - gg.sy
      if (Math.abs(dx) + Math.abs(dy) > 6) { moved.current = true; touchOnce() }
      if (moved.current) setView(clamp(gg.v0.k, gg.v0.x + dx, gg.v0.y + dy))
    }
  }
  const onUp = (e: RPointerEvent) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size === 1 && g.current?.mode === 'pinch') {
      const [p] = [...ptrs.current.values()]
      g.current = { mode: 'pan', sx: p.x, sy: p.y, v0: viewRef.current, d0: 0, ux: 0, uy: 0 }
    } else if (ptrs.current.size === 0) g.current = null
  }
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const h = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY) }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  })

  const s = fit * view.k
  const canPan = size.nw * s > size.w + 2 || size.nh * s > boxH + 2
  return (
    <div>
      <div
        ref={wrap} dir="ltr" role="group" aria-label="خريطة الكراسي"
        className="relative w-full overflow-hidden select-none"
        style={{ height: boxH, touchAction: canPan ? 'none' : 'pan-y' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false } }}
      >
        <div ref={inner} className="absolute left-1/2 top-1/2 w-max" style={{ transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${s})`, transformOrigin: '50% 50%', transition: anim ? 'transform .45s cubic-bezier(.22,.8,.3,1)' : undefined }}>
          <Screen width={screenW} />
          {/* block letters */}
          <div className="flex items-center mb-1.5" style={{ gap: AISLE }}>
            <span style={{ width: LABEL }} />
            {blocks.map((k) => (
              <button key={k} type="button" disabled={!onSection} style={{ width: secW(k) }}
                onClick={() => onSection?.(seats.filter((x) => x.section === k))}
                className={`text-center text-sm font-black enabled:hover:text-emerald-400 transition-colors ${focus === k ? 'text-emerald-400' : 'text-slate-400'}`}>{k}</button>
            ))}
            <span style={{ width: LABEL }} />
          </div>

          <div className="space-y-1.5">
            {rows.map((r) => {
              const all = blocks.flatMap((k) => r.by[k] || [])
              return (
                <div key={r.no} className="flex items-center" style={{ gap: AISLE }}>
                  <button type="button" disabled={!onRow} onClick={() => onRow?.(all)} style={{ width: LABEL }} className="text-center text-xs font-bold text-slate-500 enabled:hover:text-emerald-400">{r.no}</button>
                  {blocks.map((k, bi) => {
                    const list = r.by[k] || []
                    return (
                      <div key={k} className={`flex ${justify(bi)}`} style={{ width: secW(k) }}>
                        {list.map((st, i) => {
                          const v = seatView(st, now)
                          const booked = v === 'held' || v === 'taken'
                          const student = !admin && !readOnly
                          const wrongGender = student && !!gender && st.restriction !== 'any' && st.restriction !== gender
                          const mine = mineId === st.id
                          const selected = !!selectedIds?.has(st.id)
                          const clickable = !readOnly && (admin ? true : v === 'free' && !wrongGender)
                          const hidden = v === 'blocked' && student && !selected && !mine
                          const looksBooked = booked || wrongGender   // students only ever see: free / booked / mine
                          // an aisle is just a hole in the position sequence → draw it as empty space
                          const hole = Math.max(0, st.pos - (i ? list[i - 1].pos : 0) - 1)

                          let chair: string
                          if (selected || mine) chair = 'text-yellow-300 seat-selected'
                          else if (readOnly) chair = v === 'blocked' ? 'text-slate-800' : booked ? MARK_CLS[marks?.[st.id] ?? 'pending'] : 'text-emerald-500'
                          else if (v === 'blocked') chair = 'text-slate-800'
                          else if (looksBooked) chair = 'text-slate-600'
                          else if (admin && st.restriction === 'male') chair = 'text-sky-500 group-hover:text-sky-400'
                          else if (admin && st.restriction === 'female') chair = 'text-pink-500 group-hover:text-pink-400'
                          else chair = 'text-emerald-500 group-hover:text-emerald-400'

                          const showNum = selected || mine || readOnly || admin || !looksBooked
                          return (
                            <button key={st.id} type="button" disabled={!clickable} onClick={(e) => onSeat?.(st, e)} title={st.label} aria-label={`كرسي ${st.label}`}
                              style={{ width: SEAT, height: SEAT, marginInlineStart: hole ? hole * (SEAT + GAP) : undefined }}
                              className={`group relative shrink-0 transition-transform ${selected || mine ? 'scale-110 z-10' : ''} ${hidden ? 'opacity-0 pointer-events-none' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
                              <Chair className={chair} />
                              {selected && <span className="pointer-events-none absolute -inset-1 rounded-xl ring-2 ring-yellow-300/80" />}
                              {showNum && v !== 'blocked' || (admin && v === 'blocked') ? <span className={`absolute inset-x-0 bottom-[4px] text-center text-[11px] leading-none font-extrabold tabular-nums ${selected || mine ? 'text-slate-900' : v === 'blocked' ? 'text-slate-600' : 'text-white/95'}`}>{st.seat_no}</span> : null}
                              {admin && st.restriction !== 'any' && v !== 'blocked' && <Lock className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 text-white/80" />}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                  <span style={{ width: LABEL }} className="text-center text-xs font-bold text-slate-500">{r.no}</span>
                </div>
              )
            })}
          </div>
          {/* breathing room after the last row, so it can always be dragged up and tapped */}
          <div style={{ height: 56 }} aria-hidden />
        </div>

        {/* gesture hint: shown only when the map can really be moved, gone at the first touch */}
        {canPan && !touched && !readOnly && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center z-20">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/70 text-white text-xs font-semibold backdrop-blur shadow-lg">
              <Move className="w-4 h-4 pan-hint text-emerald-300" /> اسحب لفوق وتحت ويمين وشمال · قرّب بإصبعين
            </div>
          </div>
        )}
      </div>

      {/* legend + zoom, below the hall so nothing sits on top of the chairs */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Legend admin={admin} readOnly={readOnly} />
        <div className="flex items-center gap-1.5 ms-auto" dir="ltr">
          <button type="button" onClick={() => zoomBy(1 / 1.2)} className="p-2 rounded-xl bg-slate-800/90 text-slate-200 hover:bg-slate-700" aria-label="تصغير"><ZoomOut className="w-4 h-4" /></button>
          <button type="button" onClick={() => zoomBy(1.2)} className="p-2 rounded-xl bg-slate-800/90 text-slate-200 hover:bg-slate-700" aria-label="تكبير"><ZoomIn className="w-4 h-4" /></button>
          {view.k > kMin + 0.01 && <button type="button" onClick={() => { touchOnce(); setView({ k: kMin, x: 0, y: 0 }) }} className="p-2 rounded-xl bg-slate-800/90 text-slate-200 hover:bg-slate-700" aria-label="الخريطة كاملة"><Maximize className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  )
}

function Legend({ admin, readOnly }: { admin?: boolean; readOnly?: boolean }) {
  const items: Array<[string, string]> = readOnly
    ? [['text-emerald-500', 'متاح'], ['text-amber-500', 'قيد المراجعة'], ['text-violet-500', 'مؤكد'], ['text-sky-400', 'دخل'], ['text-slate-800', 'مقفول']]
    : admin
      ? [['text-emerald-500', 'متاح'], ['text-sky-500', 'للشباب فقط'], ['text-pink-500', 'للبنات فقط'], ['text-slate-600', 'محجوز'], ['text-slate-800', 'مقفول'], ['text-yellow-300', 'المختار']]
      : [['text-emerald-500', 'متاح'], ['text-slate-600', 'محجوز'], ['text-yellow-300', 'اختيارك']]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
      {items.map(([c, t]) => (
        <span key={t} className="flex items-center gap-1.5"><span className="relative w-5 h-5"><Chair className={c} /></span>{t}</span>
      ))}
    </div>
  )
}

/** the dark "cinema hall" backdrop, used in both light and dark mode */
export function HallPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 text-white p-2.5 sm:p-5 ring-1 ring-slate-700/60 ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="relative">{children}</div>
    </div>
  )
}
