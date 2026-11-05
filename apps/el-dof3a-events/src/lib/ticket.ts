import qrcode from 'qrcode-generator'
import type { Booking } from './api'

const W = 1080, H = 1600

/** the two empty boxes of the ticket artwork (public/ticket-bg.jpg): QR on the left, the typed data on the right */
const QR_BOX = { x: 56, y: 1290, w: 327, h: 298 }
const INFO_BOX = { x: 425, y: 1290, w: 620, h: 298 }

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = 800) {
  let size = start
  do { ctx.font = `${weight} ${size}px Cairo, sans-serif` } while (ctx.measureText(text).width > maxW && (size -= 2) > 18)
}

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src
})

/** "C3-2" → block C · row 3 · seat 2 (older labels like "B37", or no seat at all, still print sensibly) */
function splitSeat(b: Booking): Array<{ label: string; value: string }> {
  const lab = b.seat_label
  if (!lab) return [{ label: 'نوع التذكرة', value: 'حضور' }]
  const m = /^([A-Z0-9]+?)(\d+)-(\d+)$/i.exec(lab)
  if (m) {
    let key = m[1], row = m[2]
    const sr = b.seat_row ? String(b.seat_row) : ''
    const [head] = lab.split('-')
    if (sr && head.endsWith(sr) && head.length > sr.length) { key = head.slice(0, head.length - sr.length); row = sr }   // block keys may contain digits
    return [{ label: 'البلوك', value: key.toUpperCase() }, { label: 'الصف', value: row }, { label: 'الكرسي', value: m[3] }]
  }
  return [{ label: 'رقم الكرسي', value: lab }]
}

/** Draws the e-ticket on a canvas (the browser shapes the Arabic, so no PDF font tricks are needed). */
export async function renderTicket(b: Booking): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load('800 40px Cairo'), document.fonts.load('600 30px Cairo')]) } catch { /* fallback font */ }

  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.direction = 'rtl'

  // the artwork (falls back to a plain dark card if the picture is missing)
  const bg = await loadImg(`${import.meta.env.BASE_URL}ticket-bg.jpg`)
  if (bg) ctx.drawImage(bg, 0, 0, W, H)
  else { ctx.fillStyle = '#0b1512'; ctx.fillRect(0, 0, W, H) }

  const panel = (r: { x: number; y: number; w: number; h: number }, fill: string) => {
    ctx.fillStyle = fill
    ctx.beginPath(); ctx.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 30); ctx.fill()      // 2px bleed hides the grey placeholder edge
  }

  // ---- QR box (left) — the gate scanner reads QR only. It carries the booking id: unguessable, no personal data.
  panel(QR_BOX, '#ffffff')
  const qr = qrcode(0, 'M')
  qr.addData(b.id.toUpperCase(), 'Alphanumeric')
  qr.make()
  const n = qr.getModuleCount()
  const pad = 2                                          // quiet zone, in modules (the white panel adds more around it)
  const cell = Math.floor(Math.min(QR_BOX.w, QR_BOX.h) / (n + pad * 2))
  const side = cell * (n + pad * 2)
  const qx = QR_BOX.x + Math.round((QR_BOX.w - side) / 2), qy = QR_BOX.y + Math.round((QR_BOX.h - side) / 2)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) {
      if (qr.isDark(r, k)) ctx.fillRect(qx + (k + pad) * cell, qy + (r + pad) * cell, cell, cell)
    }
  }

  // ---- info box (right): name · academic no. · seat · how to enter
  panel(INFO_BOX, '#0c1714')
  ctx.textAlign = 'right'
  ctx.strokeStyle = 'rgba(232,226,140,.55)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(INFO_BOX.x, INFO_BOX.y, INFO_BOX.w, INFO_BOX.h, 28); ctx.stroke()

  const y0 = INFO_BOX.y, mid = INFO_BOX.x + INFO_BOX.w / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'; fitText(ctx, b.name, INFO_BOX.w - 56, 40); ctx.fillText(b.name, mid, y0 + 40)
  // academic number: big, bold, gold — the first thing the gate checks against the ID card
  const acad = b.academic_no || '—'
  ctx.fillStyle = '#f5e66b'; fitText(ctx, acad, INFO_BOX.w - 56, 56, 900)
  ctx.letterSpacing = '4px'; ctx.fillText(acad, mid, y0 + 98); ctx.letterSpacing = '0px'

  // ---- the seat: one gold plate, block on the left → row → seat on the right
  const seat = splitSeat(b)
  const px = INFO_BOX.x + 18, pw = INFO_BOX.w - 36, py = y0 + 112, ph = 112
  const g = ctx.createLinearGradient(px, py, px + pw, py + ph)
  g.addColorStop(0, '#f8ec7a'); g.addColorStop(1, '#e3bf3c')
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 22); ctx.fill()
  const cw = pw / seat.length
  seat.forEach((cell, i) => {
    const cx = px + cw * (i + 0.5)
    if (i > 0) { ctx.fillStyle = 'rgba(16,32,26,.25)'; ctx.fillRect(px + cw * i - 1.5, py + 16, 3, ph - 32) }
    ctx.fillStyle = '#3d3a12'; ctx.font = '800 23px Cairo, sans-serif'; ctx.fillText(cell.label, cx, py + 31)
    ctx.fillStyle = '#10201a'; fitText(ctx, cell.value, cw - 24, 76, 900); ctx.fillText(cell.value, cx, py + 96)
  })

  if (seat.length === 3) { ctx.fillStyle = '#f5e66b'; ctx.font = '700 23px Cairo, sans-serif'; ctx.fillText('الترقيم من اليمين للشمال', mid, y0 + 255) }
  ctx.fillStyle = '#e9ecd0'; fitText(ctx, 'الدخول باستخدام الكارنيه و التذكرة دي', INFO_BOX.w - 52, 27, 700)
  ctx.fillText('الدخول باستخدام الكارنيه و التذكرة دي', mid, y0 + 286)
  return c
}

export async function downloadTicket(b: Booking) {
  const c = await renderTicket(b)
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `ticket-${b.seat_label || b.id.slice(0, 6)}.png`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** opens the print dialog → "Save as PDF" */
export async function printTicket(b: Booking): Promise<boolean> {
  const w = window.open('', '_blank')
  if (!w) return false
  const c = await renderTicket(b)
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>تذكرة</title><style>@page{size:A5 portrait;margin:0}html,body{margin:0;background:#fff}img{display:block;height:205mm;width:auto;max-width:100%;margin:0 auto}</style></head><body><img src="${c.toDataURL('image/png')}"></body></html>`)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
  return true
}
