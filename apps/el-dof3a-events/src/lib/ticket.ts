import qrcode from 'qrcode-generator'
import type { Booking } from './api'
import { formatCairo } from './time'

const W = 1080, H = 1640

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = 800) {
  let size = start
  do { ctx.font = `${weight} ${size}px Cairo, sans-serif` } while (ctx.measureText(text).width > maxW && (size -= 2) > 22)
}

/** Draws the e-ticket on a canvas (the browser shapes the Arabic, so no PDF font tricks are needed). */
export async function renderTicket(b: Booking): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load('800 40px Cairo'), document.fonts.load('600 30px Cairo')]) } catch { /* fallback font */ }

  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.direction = 'rtl'
  ctx.textAlign = 'center'

  // paper
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)

  const logo = await new Promise<HTMLImageElement | null>((res) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = `${import.meta.env.BASE_URL}logo.jpg`
  })

  // header band
  const py = 420
  const hg = ctx.createLinearGradient(0, 0, W, py)
  hg.addColorStop(0, '#059669'); hg.addColorStop(1, '#0d9488')
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, py)
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 36px Cairo, sans-serif'
  ctx.fillText('إيفينتات الدفعة · تذكرة دخول', W / 2, 88)
  if (logo) {
    ctx.save(); ctx.beginPath(); ctx.arc(130, 96, 70, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
    ctx.fillStyle = '#fff'; ctx.fillRect(60, 26, 140, 140); ctx.drawImage(logo, 60, 26, 140, 140); ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(130, 96, 70, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.fillStyle = '#ffffff'; fitText(ctx, b.event_title, W - 140, 86); ctx.fillText(b.event_title, W / 2, 205)
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '600 38px Cairo, sans-serif'; ctx.fillText(formatCairo(b.event_at), W / 2, 283)
  if (b.event_venue) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '600 34px Cairo, sans-serif'; ctx.fillText(b.event_venue, W / 2, 340) }
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 26px Cairo, sans-serif'
  ctx.fillText('تذكرة دخول لمرة واحدة — متشاركهاش مع حد', W / 2, 392)

  // perforation
  ctx.fillStyle = '#e2e8f0'
  ctx.beginPath(); ctx.arc(0, py, 36, 0, Math.PI * 2); ctx.arc(W, py, 36, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([14, 12]); ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(60, py); ctx.lineTo(W - 60, py); ctx.stroke(); ctx.setLineDash([])

  // holder
  ctx.fillStyle = '#64748b'; ctx.font = '600 32px Cairo, sans-serif'; ctx.fillText('اسم صاحب الحجز', W / 2, 498)
  ctx.fillStyle = '#0f172a'; fitText(ctx, b.name, W - 120, 64); ctx.fillText(b.name, W / 2, 562)
  ctx.fillStyle = '#475569'; ctx.font = '600 36px Cairo, sans-serif'
  if (b.academic_no) ctx.fillText(`الرقم الأكاديمي: ${b.academic_no}`, W / 2, 618)
  ctx.fillText(`الرقم القومي: ${b.national_id}`, W / 2, 668)

  // seat / admission box
  const sy = 706
  const sg = ctx.createLinearGradient(140, sy, W - 140, sy + 194)
  sg.addColorStop(0, '#059669'); sg.addColorStop(1, '#0d9488')
  ctx.fillStyle = sg
  ctx.beginPath(); ctx.roundRect(140, sy, W - 280, 194, 32); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '700 32px Cairo, sans-serif'
  ctx.fillText(b.seat_label ? 'رقم الكرسي' : 'نوع التذكرة', W / 2, sy + 54)
  ctx.fillStyle = '#ffffff'; ctx.font = `900 ${b.seat_label ? 120 : 100}px Cairo, sans-serif`
  ctx.fillText(b.seat_label || 'حضور', W / 2, sy + 168)

  // QR code — the gate scanner reads QR only (works in any light, from any angle, on any phone).
  // It carries the booking id: unguessable, no personal data, and it only opens its own event.
  const by = 960
  const qr = qrcode(0, 'M')
  qr.addData(b.id.toUpperCase(), 'Alphanumeric')          // 36 chars → tiny, chunky QR
  qr.make()
  const n = qr.getModuleCount()
  const pad = 3                                          // quiet zone, in modules
  const cell = Math.floor(600 / (n + pad * 2))
  const side = cell * (n + pad * 2)
  const qx = Math.round((W - side) / 2), qy = by + 22
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.roundRect(70, by, W - 140, side + 44, 28); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(qx + (c + pad) * cell, qy + (r + pad) * cell, cell, cell)
    }
  }
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
