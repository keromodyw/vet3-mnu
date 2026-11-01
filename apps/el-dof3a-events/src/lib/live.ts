import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export interface LiveSpec { table: string; filter?: string }

/**
 * Calls onChange on Supabase Realtime events, plus a safety-net poll,
 * plus when the tab becomes visible / the network comes back.
 */
export function useRealtime(specs: Array<string | LiveSpec>, onChange: () => void, intervalMs = 15000) {
  const cb = useRef(onChange)
  cb.current = onChange
  const [connected, setConnected] = useState(false)
  const list: LiveSpec[] = specs.map((s) => (typeof s === 'string' ? { table: s } : s))
  const key = JSON.stringify(list)

  useEffect(() => {
    let timer: number | undefined
    const fire = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => cb.current(), 200)
    }
    const channel = supabase.channel(`md-${Math.random().toString(36).slice(2)}`)
    for (const s of JSON.parse(key) as LiveSpec[]) {
      channel.on('postgres_changes', { event: '*', schema: 'el_dof3a_events', table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, fire)
    }
    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED')
      if (status === 'SUBSCRIBED') cb.current() // catch anything missed while connecting
    })

    const poll = window.setInterval(() => cb.current(), intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') cb.current() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', fire)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', fire)
      supabase.removeChannel(channel)
    }
  }, [key, intervalMs])

  return connected
}

export function useLive<T>(fetcher: () => Promise<T>, specs: Array<string | LiveSpec>, intervalMs = 15000) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const my = ++seq.current
    try {
      const d = await fetchRef.current()
      if (my === seq.current) { setData(d); setError(null) } // ignore out-of-order responses
    } catch (e: any) {
      setError(e?.message || 'error')
      console.error('live fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  const connected = useRealtime(specs, reload, intervalMs)
  return { data, loading, error, connected, reload, setData }
}

/** reads every row, past PostgREST's 1000-row page limit */
export async function pageAll<T>(make: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw error
    out.push(...((data as T[]) || []))
    if (!data || data.length < 1000) break
  }
  return out
}
