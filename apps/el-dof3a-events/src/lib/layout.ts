/** A hall design: rows × blocks, with optional aisles inside a block. Saved as a named template. */
export interface LayoutBlock {
  /** block letter shown on the map (A, B, C … or any 1–3 letters/digits) */
  key: string
  /** seats in the front row */
  seats: number
  /** extra seats added to every row going back (may be negative) */
  grow: number
  /** put an aisle after every N seats inside the block (0 = no aisle) */
  aisleEvery: number
  /** aisle width, in seat widths */
  aisleWidth: number
}

export interface LayoutSpec {
  rows: number
  dir: 'rtl' | 'ltr'
  blocks: LayoutBlock[]
}

export const MAX_ROWS = 40
export const MAX_BLOCKS = 12
export const MAX_BLOCK_SEATS = 40

export const DEFAULT_SPEC: LayoutSpec = {
  rows: 8,
  dir: 'rtl',
  blocks: [
    { key: 'C', seats: 4, grow: 1, aisleEvery: 0, aisleWidth: 1 },
    { key: 'B', seats: 8, grow: 0, aisleEvery: 0, aisleWidth: 1 },
    { key: 'A', seats: 4, grow: 1, aisleEvery: 0, aisleWidth: 1 },
  ],
}

export const cloneSpec = (s: LayoutSpec): LayoutSpec => ({ rows: s.rows, dir: s.dir, blocks: s.blocks.map((b) => ({ ...b })) })

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/** uppercase letters/digits only, at most 3 characters */
export const blockKey = (k: unknown, fallback = 'A') => {
  const s = String(k ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
  return s || fallback
}

const freeKey = (used: Set<string>) => {
  for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c }
  for (let i = 1; i < 10; i++) if (!used.has(String(i))) return String(i)
  return 'X'
}

/** accepts anything that came from the database and returns a safe, unique-keyed spec */
export function sanitizeSpec(raw: unknown): LayoutSpec {
  const r = (raw ?? {}) as { rows?: unknown; dir?: unknown; blocks?: unknown }
  const used = new Set<string>()
  const blocks: LayoutBlock[] = (Array.isArray(r.blocks) ? r.blocks : []).slice(0, MAX_BLOCKS).map((b: unknown, i: number) => {
    const x = (b ?? {}) as Record<string, unknown>
    let key = blockKey(x.key, String.fromCharCode(65 + (i % 26)))
    if (used.has(key)) key = freeKey(used)
    used.add(key)
    return {
      key,
      seats: clampInt(x.seats, 0, MAX_BLOCK_SEATS, 0),
      grow: clampInt(x.grow, -5, 5, 0),
      aisleEvery: clampInt(x.aisleEvery, 0, MAX_BLOCK_SEATS, 0),
      aisleWidth: clampInt(x.aisleWidth, 0, 4, 1),
    }
  })
  return {
    rows: clampInt(r.rows, 1, MAX_ROWS, DEFAULT_SPEC.rows),
    dir: r.dir === 'ltr' ? 'ltr' : 'rtl',
    blocks: blocks.length ? blocks : DEFAULT_SPEC.blocks.map((b) => ({ ...b })),
  }
}

export const nextBlockKey = (blocks: LayoutBlock[]) => {
  const used = new Set(blocks.map((b) => b.key))
  return freeKey(used)
}

/** exact number of chairs this block will produce */
export function blockSeats(b: LayoutBlock, rows: number): number {
  let n = 0
  for (let r = 0; r < rows; r++) n += Math.max(0, b.seats + r * b.grow)
  return n
}

export const specSeats = (spec: LayoutSpec) => spec.blocks.reduce((n, b) => n + blockSeats(b, spec.rows), 0)

/** display order of a seat's block: left → right on the map (legacy halls had no explicit order) */
const LEGACY_ORDER: Record<string, number> = { C: 0, B: 1, A: 2 }
export const sectionOrder = (s: { section: string; section_order?: number }) =>
  s.section_order ?? LEGACY_ORDER[s.section] ?? 0

/** blocks present in a seat list, in map order */
export function sectionKeys(seats: Array<{ section: string; section_order?: number }>): string[] {
  const m = new Map<string, number>()
  for (const s of seats) {
    const o = sectionOrder(s)
    const cur = m.get(s.section)
    if (cur === undefined || o < cur) m.set(s.section, o)
  }
  return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([k]) => k)
}
