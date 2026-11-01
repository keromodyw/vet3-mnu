import * as XLSX from 'xlsx'
import { formatCairo } from './time'

export interface ExportRow { name: string; national_id: string; academic_no: string | null; batch: string; seat: string | null; status: string }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'event'

export function exportReservationsXlsx(eventTitle: string, rows: ExportRow[]) {
  const aoa = [['م', 'الاسم', 'الرقم القومي', 'الرقم الأكاديمي', 'الدفعة', 'الكرسي', 'الحالة'],
    ...rows.map((r, i) => [i + 1, r.name, r.national_id, r.academic_no ?? '', r.batch, r.seat ?? '', r.status])]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 5 }, { wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 14 }]
  ws['!views'] = [{ RTL: true }] as any
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الحجوزات')
  XLSX.writeFile(wb, `حجوزات-${safeName(eventTitle)}.xlsx`)
}

export function printReservationsPdf(eventTitle: string, rows: ExportRow[]): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(eventTitle)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:12mm}*{font-family:'Cairo',sans-serif;box-sizing:border-box}
body{margin:0;color:#111;font-size:10pt}h1{font-size:16pt;margin:0 0 2px;color:#7c2d12}.m{color:#666;font-size:9pt;margin-bottom:10px}
table{width:100%;border-collapse:collapse}th{background:#fde68a;text-align:right}th,td{border:1px solid #cbd5e1;padding:4px 6px}
tr{break-inside:avoid}td.n{direction:ltr;text-align:right;font-variant-numeric:tabular-nums}
</style></head><body>
<h1>${esc(eventTitle)}</h1><div class="m">${rows.length} حجز · ${esc(formatCairo(new Date().toISOString()))}</div>
<table><thead><tr><th>م</th><th>الاسم</th><th>الرقم القومي</th><th>الرقم الأكاديمي</th><th>الدفعة</th><th>الكرسي</th><th>الحالة</th></tr></thead><tbody>
${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="n">${esc(r.national_id)}</td><td class="n">${esc(r.academic_no)}</td><td>${esc(r.batch)}</td><td>${esc(r.seat)}</td><td>${esc(r.status)}</td></tr>`).join('')}
</tbody></table></body></html>`)
  w.document.close()
  const go = async () => { try { await w.document.fonts.ready } catch { /* ignore */ } w.focus(); w.print() }
  if (w.document.readyState === 'complete') void go(); else w.addEventListener('load', () => void go())
  return true
}
