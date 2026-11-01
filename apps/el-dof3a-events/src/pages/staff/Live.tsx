import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import EventPicker, { rememberedEvent } from '../../components/EventPicker'
import { Counters, Feed, useLiveBoard } from '../../components/LiveBoard'
import StaffLayout from '../../components/StaffLayout'
import { btnGhost, FullLoader } from '../../components/ui'

export default function Live() {
  const [eventId, setEventId] = useState(rememberedEvent())
  const box = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)

  // leaving real fullscreen with Esc also leaves our overlay
  useEffect(() => {
    const h = () => { if (!document.fullscreenElement) setFull(false) }
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])
  const enter = async () => { setFull(true); try { await box.current?.requestFullscreen?.() } catch { /* iOS: the overlay alone is the fullscreen */ } }
  const exit = async () => { setFull(false); try { if (document.fullscreenElement) await document.exitFullscreen() } catch { /* ignore */ } }

  return (
    <StaffLayout title="متابعة السكان" roles={['super_admin']}
      actions={<>
        <EventPicker value={eventId} onChange={setEventId} />
        <button className={btnGhost} onClick={enter}><Maximize className="w-4 h-4" /> ملء الشاشة</button>
      </>}>
      <div ref={box} className={full ? 'fixed inset-0 z-[80] bg-page overflow-y-auto p-5 sm:p-8' : ''}>
        {full && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-black">متابعة السكان</h2>
            <button className={btnGhost} onClick={exit}><Minimize className="w-4 h-4" /> خروج</button>
          </div>
        )}
        {eventId ? <Board eventId={eventId} big={full} /> : <FullLoader />}
      </div>
    </StaffLayout>
  )
}

function Board({ eventId, big }: { eventId: string; big: boolean }) {
  const { data, loading } = useLiveBoard(eventId)
  if (loading || !data) return <FullLoader />
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Counters s={data.stats} big />
      <Feed rows={big ? data.feed : data.feed.slice(0, 25)} />
    </div>
  )
}
