import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLive } from '../lib/live'
import type { EventRow } from '../lib/api'

const KEY = 'md_staff_event'
export const rememberedEvent = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }

/** shared "which event am I working on" dropdown; remembers the choice */
export default function EventPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useLive(async () => {
    const { data, error } = await supabase.from('events').select('id,title,event_at').order('event_at', { ascending: false, nullsFirst: false })
    if (error) throw error
    return (data || []) as Pick<EventRow, 'id' | 'title' | 'event_at'>[]
  }, ['events'], 30000)
  const list = data || []

  useEffect(() => {
    if (!list.length) return
    if (!value || !list.some((e) => e.id === value)) {
      const saved = rememberedEvent()
      onChange(list.some((e) => e.id === saved) ? saved : list[0].id)
    }
  }, [list, value, onChange])

  return (
    <select value={value} onChange={(e) => { try { localStorage.setItem(KEY, e.target.value) } catch { /* ignore */ } onChange(e.target.value) }}
      className="px-3 py-2 rounded-xl bg-ink/10 border border-line text-ink max-w-[16rem]">
      {list.length === 0 && <option value="">مفيش إيفينتات</option>}
      {list.map((e) => <option key={e.id} value={e.id} className="text-ink">{e.title}</option>)}
    </select>
  )
}
