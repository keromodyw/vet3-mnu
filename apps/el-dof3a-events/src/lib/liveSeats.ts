import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSeats, type Seat } from './api'
import { supabase } from './supabase'

/**
 * Live seat map, hybrid:
 *  • every change arrives as a small broadcast message and is applied to the list at once (no re-download);
 *  • the WHOLE list is downloaded again only when: the connection (re)connects · the tab comes back into view ·
 *    the network comes back · every ~15 s (safety net) · right after a "chair taken" error (call reload()).
 * It only changes what people SEE — the database alone decides who gets a chair.
 */
export const SAFETY_MS = 15000

const jitter = (ms: number, spread = 0.25) => ms * (1 - spread + Math.random() * 2 * spread)   // keeps thousands of phones from asking in the same second

type Row = Seat & Record<string, unknown>
interface Msg { up?: Row[]; del?: string[]; reload?: boolean }

/** compact snapshot → Seat[]; falls back to the plain table read if the v6 SQL has not been run yet */
export async function fetchSeatsFast(eventId: string): Promise<Seat[]> {
  try {
    const { data, error } = await supabase.rpc('md_seats_snapshot', { p_event: eventId })
    if (error || !Array.isArray(data)) throw error || new Error('no snapshot')
    return (data as unknown[][]).map((a) => ({
      id: a[0], event_id: eventId, row_no: a[1], section: a[2], section_order: a[3], pos: a[4], seat_no: a[5], label: a[6],
      restriction: a[7], blocked: a[8], state: a[9], held_until: a[10], sort_order: a[11], row_label: a[12],
    }) as Seat)
  } catch {
    return fetchSeats(eventId)
  }
}

export function useLiveSeats(eventId: string, enabled = true) {
  const [seats, setSeats] = useState<Seat[]>([])
  const [loaded, setLoaded] = useState(false)
  const [connected, setConnected] = useState(false)

  const map = useRef(new Map<string, Seat>())
  const flushTimer = useRef<number>(0)
  const reloadTimer = useRef<number>(0)
  const fetching = useRef(false)
  const again = useRef(false)
  const buffer = useRef<Msg[]>([])              // messages that arrive while a full download is in flight
  const alive = useRef(true)
  const idRef = useRef(eventId)
  idRef.current = eventId

  // one render per ~80 ms however many messages arrive
  const flush = useCallback((now = false) => {
    const run = () => { flushTimer.current = 0; setSeats([...map.current.values()].sort((a, b) => a.sort_order - b.sort_order)) }
    if (now) { window.clearTimeout(flushTimer.current); run(); return }
    if (!flushTimer.current) flushTimer.current = window.setTimeout(run, 80)
  }, [])

  /** full download now (used by the safety net, reconnect, tab focus and after a "chair taken" error) */
  const reload = useCallback(async () => {
    if (!enabled || !idRef.current) return
    if (fetching.current) { again.current = true; return }
    fetching.current = true
    buffer.current = []
    const forEvent = idRef.current
    try {
      const list = await fetchSeatsFast(forEvent)
      if (!alive.current || forEvent !== idRef.current) return
      map.current = new Map(list.map((s) => [s.id, s]))
      for (const m of buffer.current) applyMsg(m)          // changes that arrived during the download win over its snapshot
      flush(true); setLoaded(true)
    } catch (e) {
      console.error('seat reload failed', e)
    } finally {
      fetching.current = false; buffer.current = []
      if (again.current) { again.current = false; void reload() }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, flush])

  const applyMsg = (m: Msg) => {
    if (m.reload) { scheduleReload(jitter(1500, 1)); return }   // a big edit (new hall design…): everybody re-downloads, spread over ~3 s
    for (const id of m.del || []) map.current.delete(id)
    for (const r of m.up || []) if (r && r.id) map.current.set(r.id, { ...(map.current.get(r.id) || {}), ...r } as Seat)
    flush()
  }
  const scheduleReload = (delay: number) => {
    window.clearTimeout(reloadTimer.current)
    reloadTimer.current = window.setTimeout(() => void reload(), delay)
  }

  useEffect(() => {
    alive.current = true
    map.current = new Map(); setSeats([]); setLoaded(false); setConnected(false)
    if (!enabled || !eventId) { setLoaded(true); return () => { alive.current = false } }

    let first = true
    const channel = supabase.channel(`md-seats:${eventId}`, { config: { broadcast: { self: false } } })
    channel.on('broadcast', { event: 'seats' }, ({ payload }) => {
      const m = (payload || {}) as Msg
      if (fetching.current) buffer.current.push(m)
      applyMsg(m)
    })
    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED')
      if (status === 'SUBSCRIBED') { scheduleReload(jitter(first ? 400 : 600, 1)); first = false }   // (re)connected → catch up on anything missed
    })

    // safety net: ~15 s, only while the tab is visible (coming back into view reloads by itself)
    let safety = 0
    const arm = () => { safety = window.setTimeout(() => { if (document.visibilityState === 'visible') void reload(); arm() }, jitter(SAFETY_MS)) }
    arm()
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleReload(jitter(150, 1)) }
    const onOnline = () => scheduleReload(jitter(500, 1))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    void reload()                                           // don't wait for the socket: first paint comes from the download

    return () => {
      alive.current = false
      window.clearTimeout(safety); window.clearTimeout(reloadTimer.current); window.clearTimeout(flushTimer.current); flushTimer.current = 0
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      void supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, enabled])

  return { data: loaded ? seats : null, loading: !loaded, connected, reload }
}
