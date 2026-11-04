import type { Seat } from './api'
import { sectionKeys } from './layout'

/**
 * Prints the hall map (opens the print dialog → "Save as PDF").
 * The drawing follows the on-screen map: same blocks, rows and aisles, chairs coloured by status,
 * plus a legend and a short "how to read a chair name" guide (A1-2 = block A · row 1 · seat 2).
 */

const SEAT = 36, GAP = 4, AISLE = 28, LABEL = 24, ROW_GAP = 6

const C = { free: '#10b981', male: '#0ea5e9', female: '#ec4899', booked: '#475569', blocked: '#cbd5e1' }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Kind = 'free' | 'male' | 'female' | 'booked' | 'blocked'

function kindOf(s: Seat, now: number, showStatus: boolean): Kind {
  if (s.blocked) return 'blocked'
  const booked = s.state === 'taken' || (s.state === 'held' && !!s.held_until && new Date(s.held_until).getTime() >= now)
  if (showStatus && booked) return 'booked'
  if (s.restriction === 'male') return 'male'
  if (s.restriction === 'female') return 'female'
  return 'free'
}

/** the same chair drawing the screen uses (40×40 box) */
const chair = (fill: string, x: number, y: number, n: string, dim: boolean) => `
<g transform="translate(${x} ${y}) scale(${SEAT / 40})">
  <rect x="9" y="2" width="22" height="19" rx="8" fill="${fill}"/>
  <rect x="6" y="19" width="28" height="15" rx="5" fill="${fill}"/>
  <rect x="1" y="14" width="7" height="21" rx="3.5" fill="${fill}"/>
  <rect x="32" y="14" width="7" height="21" rx="3.5" fill="${fill}"/>
  <rect x="9" y="2" width="22" height="19" rx="8" fill="#000" fill-opacity=".10"/>
  <rect x="1" y="14" width="7" height="21" rx="3.5" fill="#000" fill-opacity=".18"/>
  <rect x="32" y="14" width="7" height="21" rx="3.5" fill="#000" fill-opacity=".18"/>
  ${dim ? '<path d="M8 8 L32 32 M32 8 L8 32" stroke="#64748b" stroke-width="3.5" stroke-linecap="round"/>' : `<text x="20" y="31" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" font-family="Cairo, sans-serif">${esc(n)}</text>`}
</g>`

function hallSvg(seats: Seat[], now: number, showStatus: boolean) {
  const maxPos: Record<string, number> = {}
  const byRow = new Map<number, Record<string, Seat[]>>()
  for (const s of seats) {
    if (!byRow.has(s.row_no)) byRow.set(s.row_no, {})
    ;(byRow.get(s.row_no)![s.section] ||= []).push(s)
    maxPos[s.section] = Math.max(maxPos[s.section] || 0, s.pos)
  }
  const blocks = sectionKeys(seats)
  const rows = [...byRow.entries()].sort(([a], [b]) => a - b)
  const secW = (k: string) => Math.max(SEAT, (maxPos[k] || 0) * (SEAT + GAP) - GAP)
  const mid = (blocks.length - 1) / 2
  const hallW = 2 * LABEL + (blocks.length + 1) * AISLE + blocks.reduce((n, b) => n + secW(b), 0)

  const left: Record<string, number> = {}
  let x = LABEL + AISLE
  for (const k of blocks) { left[k] = x; x += secW(k) + AISLE }

  const top = 92                          // screen + block letters
  const out: string[] = []

  // screen
  const sw = Math.round(Math.min(640, Math.max(220, hallW * 0.8)))
  const sx = (hallW - sw) / 2
  out.push(`<path d="M${sx} 40 Q${hallW / 2} 4 ${sx + sw} 40 L${sx + sw} 48 Q${hallW / 2} 14 ${sx} 48 Z" fill="#334155"/>`)
  out.push(`<text x="${hallW / 2}" y="68" text-anchor="middle" font-size="11" letter-spacing="5" fill="#64748b" font-family="Cairo, sans-serif">SCREEN · الشاشة</text>`)

  // block letters
  for (const k of blocks) out.push(`<text x="${left[k] + secW(k) / 2}" y="${top - 6}" text-anchor="middle" font-size="17" font-weight="900" fill="#0f172a" font-family="Cairo, sans-serif">${esc(k)}</text>`)

  rows.forEach(([no, by], ri) => {
    const y = top + ri * (SEAT + ROW_GAP)
    for (const lx of [LABEL / 2, hallW - LABEL / 2]) out.push(`<text x="${lx}" y="${y + SEAT / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#64748b" font-family="Cairo, sans-serif">${no}</text>`)
    blocks.forEach((k, bi) => {
      const list = (by[k] || []).sort((a, b) => a.pos - b.pos)
      if (!list.length) return
      // the same packing the screen uses: holes in `pos` are empty space, the row hugs the middle aisle
      let groupW = 0, prev = 0
      for (const s of list) { groupW += Math.max(0, s.pos - prev - 1) * (SEAT + GAP) + SEAT; prev = s.pos }
      const room = secW(k)
      let cx = left[k] + (blocks.length === 1 || bi === mid ? (room - groupW) / 2 : bi < mid ? room - groupW : 0)
      prev = 0
      for (const s of list) {
        cx += Math.max(0, s.pos - prev - 1) * (SEAT + GAP); prev = s.pos
        const kind = kindOf(s, now, showStatus)
        out.push(chair(C[kind], cx, y, String(s.seat_no), kind === 'blocked'))
        cx += SEAT
      }
    })
  })

  const h = top + rows.length * (SEAT + ROW_GAP) + 6
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${hallW} ${h}" class="hall">${out.join('')}</svg>`, hallW, h }
}

export interface MapPdfOptions {
  title: string
  seats: Seat[]
  now: number
  /** colour booked chairs; false = a clean map that only shows restrictions + closed chairs */
  showStatus?: boolean
  /** numbering of each row-block: from the right edge (rtl) or the left edge (ltr) */
  dir?: 'rtl' | 'ltr'
}

export function printSeatMapPdf({ title, seats, now, showStatus = true, dir = 'rtl' }: MapPdfOptions): boolean {
  if (!seats.length) return false
  const w = window.open('', '_blank')
  if (!w) return false

  const { svg } = hallSvg(seats, now, showStatus)
  const cnt = { total: seats.length, blocked: 0, booked: 0, male: 0, female: 0 }
  for (const s of seats) {
    const k = kindOf(s, now, true)
    if (k === 'blocked') cnt.blocked++
    else if (k === 'booked') cnt.booked++
    if (!s.blocked && s.restriction === 'male') cnt.male++
    if (!s.blocked && s.restriction === 'female') cnt.female++
  }
  const free = cnt.total - cnt.blocked - cnt.booked

  const legend: Array<[string, string, boolean]> = [[C.free, 'متاح', false], [C.male, 'للشباب فقط', false], [C.female, 'للبنات فقط', false]]
  if (showStatus) legend.push([C.booked, 'محجوز', false])
  legend.push([C.blocked, 'مقفول (مش للحجز)', true])
  const sample = seats.find((s) => s.row_no === 1) || seats[0]
  const ex = { key: sample.section, row: sample.row_no, no: sample.seat_no }

  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box;font-family:'Cairo',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:#0f172a;font-size:10pt}
.head{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:4px;margin-bottom:6px}
h1{font-size:18pt;margin:0}.sub{color:#64748b;font-size:9pt}
.stats{display:flex;gap:14px;font-size:9.5pt}.stats b{font-size:12pt}
.hall{display:block;width:100%;max-height:128mm;margin:0 auto}
.foot{display:grid;grid-template-columns:1.1fr 1fr;gap:12px;margin-top:8px;break-inside:avoid}
.box{border:1px solid #cbd5e1;border-radius:8px;padding:7px 10px}
.box h2{font-size:10.5pt;margin:0 0 5px}
.leg{display:flex;flex-wrap:wrap;gap:6px 16px}.leg span{display:flex;align-items:center;gap:6px;font-size:9.5pt}
.leg i{display:inline-block;width:16px;height:16px;border-radius:5px;position:relative}
.leg i.x::after{content:"✕";position:absolute;inset:0;text-align:center;font-size:10px;line-height:16px;color:#64748b;font-style:normal}
.code{display:flex;align-items:center;gap:6px;direction:ltr;justify-content:center;margin:2px 0 6px;font-weight:900}
.code .big{font-size:20pt;letter-spacing:1px;background:#0f172a;color:#fff;border-radius:8px;padding:0 12px}
.parts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;font-size:9pt}
.parts b{display:block;font-size:13pt}
.note{color:#475569;font-size:8.5pt;margin-top:5px;line-height:1.5}
</style></head><body>
<div class="head"><div><h1>${esc(title)}</h1><div class="sub">خريطة القاعة · ${esc(new Date(now).toLocaleDateString('ar-EG', { dateStyle: 'long' }))}</div></div>
<div class="stats"><div>الكل <b>${cnt.total}</b></div>${showStatus ? `<div>متاح <b style="color:${C.free}">${free}</b></div><div>محجوز <b>${cnt.booked}</b></div>` : ''}<div>مقفول <b>${cnt.blocked}</b></div></div></div>
${svg}
<div class="foot">
  <div class="box"><h2>الألوان</h2><div class="leg">${legend.map(([c, t, x]) => `<span><i class="${x ? 'x' : ''}" style="background:${c}"></i>${esc(t)}</span>`).join('')}</div></div>
  <div class="box"><h2>إزاي تقرا رقم الكرسي</h2>
    <div class="code"><span class="big">${esc(ex.key)}${ex.row}-${ex.no}</span></div>
    <div class="parts"><div><b>${esc(ex.key)}</b>البلوك (الحرف فوق)</div><div><b>${ex.row}</b>رقم الصف (على الجنب)</div><div><b>${ex.no}</b>رقم الكرسي جوه الصف</div></div>
    <div class="note">ترقيم الكراسي بيبدأ من 1 في كل صف، وبيتعد من ${dir === 'rtl' ? 'اليمين' : 'الشمال'} في كل بلوك. الرقم المكتوب على الكرسي هو رقمه جوه الصف.</div>
  </div>
</div>
</body></html>`)
  w.document.close()
  const go = async () => { try { await w.document.fonts.ready } catch { /* ignore */ } w.focus(); w.print() }
  if (w.document.readyState === 'complete') void go(); else w.addEventListener('load', () => void go())
  return true
}
