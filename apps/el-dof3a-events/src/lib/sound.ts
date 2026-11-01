let ctx: AudioContext | null = null
function ac(): AudioContext | null {
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.35) {
  const c = ac(); if (!c) return
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, c.currentTime + start)
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05)
}
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p) } catch { /* unsupported (iOS) */ } }

/** call from a click so the browser allows audio later */
export const unlockAudio = () => { ac() }
export function feedbackOk() { tone(880, 0, 0.12); tone(1320, 0.12, 0.22); buzz(120) }
export function feedbackBad() { tone(220, 0, 0.25, 'sawtooth', 0.4); tone(160, 0.28, 0.4, 'sawtooth', 0.4); buzz([250, 100, 250, 100, 250]) }
export function feedbackWarn() { tone(520, 0, 0.18, 'square', 0.25); tone(400, 0.2, 0.3, 'square', 0.25); buzz([180, 80, 180]) }
export function feedbackTick() { tone(1000, 0, 0.06, 'sine', 0.2) }
