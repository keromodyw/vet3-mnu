// Arabic-aware normalisation + approximate (typo tolerant) matching

export function normalize(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, '') // accents, tashkeel, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]
    prev[0] = i
    let rowMin = prev[0]
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1))
      last = tmp
      if (prev[j] < rowMin) rowMin = prev[j]
    }
    if (rowMin > max) return max + 1
  }
  return prev[b.length]
}

// How well does query token q match document token d? (0 = no match)
export function tokenMatch(q: string, d: string): number {
  if (q === d) return 1
  if (q.length >= 2 && d.startsWith(q)) return 0.85
  if (q.length >= 3 && d.includes(q)) return 0.7
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1
    if (editDistance(q, d, max) <= max) return 0.6
  }
  return 0
}

export function queryTokens(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean)
}

function scoreText(norm: string, tokens: string[], phrase: string): number {
  if (!norm) return 0
  const words = norm.split(' ')
  let sum = 0
  let matched = 0
  for (const t of tokens) {
    let best = 0
    for (const w of words) {
      const s = tokenMatch(t, w)
      if (s > best) best = s
      if (best === 1) break
    }
    if (best > 0) matched++
    sum += best
  }
  const need = tokens.length === 1 ? 1 : Math.ceil(tokens.length * 0.6)
  if (matched < need) return 0
  let score = (sum / tokens.length) * 60
  if (norm.includes(phrase)) score += 40
  if (norm.startsWith(phrase)) score += 10
  return score
}

export interface Searchable {
  fields: { text: string; weight: number }[]
}

export function fuzzySearch<T>(items: T[], query: string, getFields: (item: T) => Searchable['fields'], limit = 80): { item: T; score: number }[] {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return []
  const phrase = tokens.join(' ')
  const out: { item: T; score: number }[] = []
  for (const item of items) {
    let best = 0
    for (const f of getFields(item)) {
      const s = scoreText(normalize(f.text), tokens, phrase) * f.weight
      if (s > best) best = s
    }
    if (best > 0) out.push({ item, score: best })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

// Splits original text into words and flags the ones that match the query
export function highlightWords(text: string, tokens: string[]): { text: string; hit: boolean }[] {
  if (!text) return []
  return text.split(/(\s+)/).map((part) => {
    if (!part.trim()) return { text: part, hit: false }
    const n = normalize(part)
    const hit = n !== '' && tokens.some((t) => n.split(' ').some((w) => tokenMatch(t, w) > 0))
    return { text: part, hit }
  })
}
