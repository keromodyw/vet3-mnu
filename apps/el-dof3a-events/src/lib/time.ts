import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const CAIRO = 'Africa/Cairo'

function cairoOffsetMs(ts: number): number {
  const sec = Math.floor(ts / 1000) * 1000
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(sec))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - sec
}

/** "2026-11-02T11:00" typed as Cairo wall-clock → UTC ISO (the device's timezone is ignored) */
export function cairoLocalToISO(local: string): string {
  const [d, t] = local.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, day, h, mi)
  let ts = wall - cairoOffsetMs(wall)
  ts = wall - cairoOffsetMs(ts)
  return new Date(ts).toISOString()
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" in Cairo (for datetime-local inputs) */
export function isoToCairoLocal(iso: string): string {
  const ts = new Date(iso).getTime()
  return new Date(ts + cairoOffsetMs(ts)).toISOString().slice(0, 16)
}

export function formatCairo(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ar-EG', {
    timeZone: CAIRO,
    ...(withDate ? { dateStyle: 'medium' as const } : {}),
    timeStyle: 'short',
  })
}

// ---- server clock: the device clock is never trusted ----
let serverOffset = 0
export async function syncServerTime(): Promise<void> {
  try {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('md_now')
    if (error || !data) throw error
    const t1 = Date.now()
    serverOffset = new Date(data as string).getTime() - (t0 + t1) / 2
  } catch (e) {
    console.error('md_now() failed, using device clock', e)
  }
}
export const serverNow = () => Date.now() + serverOffset

/** re-renders every `ms` with the server time */
export function useNow(ms = 1000): number {
  const [n, setN] = useState(serverNow())
  useEffect(() => {
    const t = window.setInterval(() => setN(serverNow()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return n
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d > 0 ? `${d} يوم ` : ''}${p(h)}:${p(m)}:${p(sec)}`
}
