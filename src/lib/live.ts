import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/**
 * Calls onChange whenever one of the tables changes (Supabase Realtime),
 * plus a safety-net poll and a refresh when the tab becomes visible again.
 */
export function useRealtime(tables: string[], onChange: () => void, intervalMs = 20000) {
  const cb = useRef(onChange)
  cb.current = onChange
  const [connected, setConnected] = useState(false)
  const key = tables.join(',')

  useEffect(() => {
    let timer: number | undefined
    const fire = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => cb.current(), 350)
    }

    const channel = supabase.channel(`live-${key}-${Math.random().toString(36).slice(2)}`)
    tables.forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire)
    })
    channel.subscribe((status) => setConnected(status === 'SUBSCRIBED'))

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])

  return connected
}

/** Fetch + keep fresh. Data is refetched on realtime events, on focus and on a timer. */
export function useLive<T>(fetcher: () => Promise<T>, tables: string[], intervalMs = 15000) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher

  const reload = useCallback(async () => {
    try {
      const d = await fetchRef.current()
      setData(d)
      setUpdatedAt(new Date())
    } catch (e) {
      console.error('live fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])
  const connected = useRealtime(tables, reload, intervalMs)

  return { data, loading, connected, updatedAt, reload }
}

/** Reads every row of a table, even past Supabase's 1000-row page limit. */
export async function fetchAll<T = any>(table: string, select = '*', orderBy?: string): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    let q = supabase.from(table).select(select).range(from, from + page - 1)
    if (orderBy) q = q.order(orderBy, { ascending: true })
    const { data, error } = await q
    if (error) throw error
    out.push(...((data as unknown as T[]) || []))
    if (!data || data.length < page) break
  }
  return out
}
