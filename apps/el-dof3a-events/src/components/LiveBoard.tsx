import { CheckCircle2, ShieldX, Users } from 'lucide-react'
import { card } from './ui'
import { rpc, SCAN_LABEL, type EventStats, type ScanRow } from '../lib/api'
import { useLive } from '../lib/live'
import { supabase } from '../lib/supabase'
import { formatCairo } from '../lib/time'

/** live entrance counters + feed. Every staff screen on the same event sees the same scans within a moment. */
export function useLiveBoard(eventId: string) {
  const f = `event_id=eq.${eventId}`
  return useLive(async () => {
    const [stats, feed] = await Promise.all([
      rpc<EventStats>('md_event_stats', { p_event: eventId }),
      supabase.from('scans').select('*').eq('event_id', eventId).order('scanned_at', { ascending: false }).limit(40),
    ])
    if (feed.error) throw feed.error
    return { stats, feed: (feed.data || []) as ScanRow[] }
  }, [{ table: 'scans', filter: f }, { table: 'bookings', filter: f }], 8000)
}

export function Counters({ s, big }: { s: EventStats | null | undefined; big?: boolean }) {
  if (!s) return null
  const remaining = Math.max(0, s.approved - s.entered)
  const items = [
    { l: 'دخلوا', v: s.entered, c: 'text-emerald-600 dark:text-emerald-300', i: CheckCircle2 },
    { l: 'لسه ما دخلوش', v: remaining, c: 'text-amber-600 dark:text-amber-300', i: Users },
    { l: 'مرفوض / مكرر', v: s.scan_declined, c: 'text-red-600 dark:text-red-300', i: ShieldX },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((x) => (
        <div key={x.l} className={`${card} text-center ${big ? 'py-6' : 'py-3'}`}>
          <x.i className={`mx-auto ${x.c} ${big ? 'w-7 h-7 mb-1' : 'w-4 h-4'}`} />
          <div className={`font-black tabular-nums ${x.c} ${big ? 'text-6xl' : 'text-2xl'}`}>{x.v}</div>
          <div className={`text-muted ${big ? 'text-sm' : 'text-[11px]'}`}>{x.l}</div>
        </div>
      ))}
    </div>
  )
}

export function Feed({ rows }: { rows: ScanRow[] }) {
  if (!rows.length) return <div className={`${card} p-6 text-center text-muted text-sm`}>لسه مفيش سكان</div>
  return (
    <div className={`${card} divide-y divide-line overflow-hidden`}>
      {rows.map((r) => {
        const ok = r.result === 'ok'
        return (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{r.student_name || r.national_id || 'غير معروف'}{r.seat_label ? ` · ${r.seat_label}` : ''}</div>
              <div className={`text-xs ${ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{SCAN_LABEL[r.result]}{r.scanner_name ? <span className="text-muted"> · {r.scanner_name}</span> : null}</div>
            </div>
            <div className="text-xs text-muted tabular-nums">{formatCairo(r.scanned_at, false)}</div>
          </div>
        )
      })}
    </div>
  )
}
