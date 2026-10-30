import { supabase } from './supabase'

const CAIRO = 'Africa/Cairo'

// How many ms Cairo is ahead of UTC at a given instant (handles DST)
function cairoOffsetMs(ts: number): number {
  const sec = Math.floor(ts / 1000) * 1000
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(sec))
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - sec
}

// "2026-11-02T11:00" typed as Cairo time -> UTC ISO string (device timezone ignored)
export function cairoLocalToISO(local: string): string {
  const [d, t] = local.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, day, h, mi)
  let ts = wall - cairoOffsetMs(wall)
  ts = wall - cairoOffsetMs(ts)
  return new Date(ts).toISOString()
}

// UTC ISO from DB -> "YYYY-MM-DDTHH:mm" in Cairo time (for datetime-local inputs)
export function isoToCairoLocal(iso: string): string {
  const ts = new Date(iso).getTime()
  return new Date(ts + cairoOffsetMs(ts)).toISOString().slice(0, 16)
}

export function formatCairo(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', { timeZone: CAIRO, dateStyle: 'medium', timeStyle: 'short' })
}

// Difference between the database server clock and this device's clock
let serverOffset = 0
export async function syncServerTime(): Promise<number> {
  try {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    if (error || !data) throw error
    const t1 = Date.now()
    serverOffset = new Date(data as string).getTime() - (t0 + t1) / 2
  } catch (e) {
    console.error('server_now() not available, falling back to device clock', e)
  }
  return serverOffset
}

export function serverNow(): number {
  return Date.now() + serverOffset
}
