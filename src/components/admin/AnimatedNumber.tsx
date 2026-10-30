import { useEffect, useRef, useState } from 'react'

export default function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(value)
  const current = useRef(value)

  useEffect(() => {
    const start = current.current
    const diff = value - start
    if (diff === 0) return
    const t0 = performance.now()
    const dur = 700
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(start + diff * eased)
      current.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return <>{shown.toLocaleString('en-US')}{suffix}</>
}
