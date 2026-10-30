export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 10) return 'دلوقتي'
  if (s < 60) return `من ${s} ثانية`
  const m = Math.floor(s / 60)
  if (m < 60) return m === 1 ? 'من دقيقة' : m === 2 ? 'من دقيقتين' : m <= 10 ? `من ${m} دقايق` : `من ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return h === 1 ? 'من ساعة' : h === 2 ? 'من ساعتين' : h <= 10 ? `من ${h} ساعات` : `من ${h} ساعة`
  const d = Math.floor(h / 24)
  return d === 1 ? 'امبارح' : d === 2 ? 'من يومين' : `من ${d} أيام`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} د ${s} ث` : `${s} ث`
}

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US')
