import { Fragment, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, LayoutGrid, Plus, Save, Trash2, Wand2 } from 'lucide-react'
import { confirmDialog, toast } from './feedback'
import { btnGhost, btnPrimary, card, inputCls, Spinner } from './ui'
import { errText, rpc, type EventRow } from '../lib/api'
import {
  MAX_BLOCKS, MAX_BLOCK_SEATS, MAX_ROWS, blockKey, nextBlockKey, sanitizeSpec, specSeats,
  type LayoutBlock, type LayoutSpec,
} from '../lib/layout'

interface Template { id: string; name: string; spec: LayoutSpec }

/** Hall designer: any block letters, any number of blocks, aisles inside a block, saved as named templates. */
export default function LayoutBuilder({ eventId, event, hasSeats, onApplied }: {
  eventId: string
  event: EventRow | null
  hasSeats: boolean
  onApplied: () => void
}) {
  const [spec, setSpec] = useState<LayoutSpec>(() => sanitizeSpec(event?.layout_spec))
  const [templates, setTemplates] = useState<Template[]>([])
  const [tpl, setTpl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const loadTemplates = async () => {
    try { setTemplates((await rpc<Template[]>('md_layouts')) || []) } catch { setTemplates([]) }
  }
  useEffect(() => { void loadTemplates() }, [])

  const patch = (i: number, p: Partial<LayoutBlock>) =>
    setSpec((s) => ({ ...s, blocks: s.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)) }))
  const move = (i: number, d: -1 | 1) => setSpec((s) => {
    const j = i + d
    if (j < 0 || j >= s.blocks.length) return s
    const blocks = [...s.blocks]
    const [x] = blocks.splice(i, 1)
    blocks.splice(j, 0, x)
    return { ...s, blocks }
  })
  const addBlock = () => setSpec((s) => s.blocks.length >= MAX_BLOCKS ? s
    : { ...s, blocks: [...s.blocks, { key: nextBlockKey(s.blocks), seats: 6, grow: 0, aisleEvery: 0, aisleWidth: 1 }] })
  const removeBlock = (i: number) => setSpec((s) => s.blocks.length <= 1 ? s
    : { ...s, blocks: s.blocks.filter((_, j) => j !== i) })

  const apply = async () => {
    const ok = await confirmDialog({
      title: 'تطبيق التصميم؟',
      message: hasSeats ? 'الكراسي الحالية هتتمسح والتصميم هيتعمل من جديد. مش هينفع لو فيه حجوزات شغالة.' : undefined,
      confirmText: 'طبّق', danger: hasSeats,
    })
    if (!ok) return
    setBusy(true)
    try {
      const clean = sanitizeSpec(spec)
      await rpc('md_apply_layout', { p_event: eventId, p_spec: clean })
      setSpec(clean)
      toast('اتعمل التصميم ✅')
      onApplied()
    } catch (e) { toast(errText(e), 'error') } finally { setBusy(false) }
  }

  const save = async () => {
    const n = name.trim()
    if (!n) return toast('اكتب اسم للتصميم الأول', 'info')
    setBusy(true)
    try {
      await rpc('md_save_layout', { p_name: n, p_spec: sanitizeSpec(spec) })
      toast(`اتحفظ التصميم «${n}» ✅`)
      setName('')
      await loadTemplates()
    } catch (e) { toast(errText(e), 'error') } finally { setBusy(false) }
  }

  const useTemplate = () => {
    const t = templates.find((x) => x.id === tpl)
    if (!t) return
    setSpec(sanitizeSpec(t.spec))
    toast(`اتحمّل «${t.name}» — راجعه وبعدين دوس «طبّق التصميم»`, 'info')
  }

  const removeTemplate = async () => {
    const t = templates.find((x) => x.id === tpl)
    if (!t) return
    if (!(await confirmDialog({ title: `تمسح تصميم «${t.name}»؟`, message: 'ده مش هيأثر على أي إيفينت مستخدم التصميم.', confirmText: 'امسح', danger: true }))) return
    setBusy(true)
    try {
      await rpc('md_delete_layout', { p_id: t.id })
      toast('اتمسح التصميم'); setTpl(''); await loadTemplates()
    } catch (e) { toast(errText(e), 'error') } finally { setBusy(false) }
  }

  return (
    <div className={`${card} p-4 mb-5 space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-bold flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-emerald-600" /> تصميم القاعة</div>
        <div className="flex-1" />
        {busy && <Spinner />}
      </div>

      {/* saved designs */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted min-w-[11rem] flex-1">تصميم محفوظ
          <select className={`${inputCls} mt-1 !py-2`} value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">— اختار تصميم —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button className={btnGhost} disabled={!tpl || busy} onClick={useTemplate}>استخدم</button>
        <button className={btnGhost} disabled={!tpl || busy} onClick={removeTemplate} aria-label="امسح التصميم"><Trash2 className="w-4 h-4 text-red-600 dark:text-red-300" /></button>
        <label className="text-xs text-muted min-w-[11rem]">اسم التصميم
          <input className={`${inputCls} mt-1 !py-2`} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: القاعة الكبيرة" />
        </label>
        <button className={btnGhost} disabled={busy} onClick={save}><Save className="w-4 h-4" /> احفظ التصميم</button>
      </div>

      {/* rows + direction */}
      <div className="flex flex-wrap items-end gap-3">
        <Num label="عدد الصفوف" value={spec.rows} min={1} max={MAX_ROWS} onChange={(n) => setSpec((s) => ({ ...s, rows: n }))} />
        <label className="text-xs text-muted">اتجاه الترقيم
          <select className={`${inputCls} mt-1 !py-2`} value={spec.dir} onChange={(e) => setSpec((s) => ({ ...s, dir: e.target.value as 'rtl' | 'ltr' }))}>
            <option value="rtl">من اليمين للشمال</option><option value="ltr">من الشمال لليمين</option>
          </select>
        </label>
        <div className="text-xs text-muted pb-2">إجمالي الكراسي: <b className="text-ink tabular-nums">{specSeats(spec)}</b></div>
      </div>

      {/* blocks */}
      <div className="space-y-2">
        <div className="text-xs text-muted">البلوكات — الترتيب من الشمال لليمين زي ما هيظهر في القاعة:</div>
        {spec.blocks.map((b, i) => (
          <div key={i} className="rounded-2xl bg-ink/5 p-2.5 flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">الحرف
              <input className={`${inputCls} w-16 mt-1 !py-2 text-center font-black uppercase`} maxLength={3} value={b.key}
                onChange={(e) => patch(i, { key: blockKey(e.target.value, b.key) })} />
            </label>
            <Num label="كراسي أول صف" value={b.seats} min={0} max={MAX_BLOCK_SEATS} onChange={(n) => patch(i, { seats: n })} />
            <Num label="+ كل صف" value={b.grow} min={-5} max={5} onChange={(n) => patch(i, { grow: n })} />
            <Num label="ممر كل" value={b.aisleEvery} min={0} max={MAX_BLOCK_SEATS} onChange={(n) => patch(i, { aisleEvery: n })} />
            <Num label="عرض الممر" value={b.aisleWidth} min={0} max={4} onChange={(n) => patch(i, { aisleWidth: n })} w="w-16" />
            <div className="flex gap-1 ms-auto">
              <button type="button" className={btnGhost} disabled={i === 0} onClick={() => move(i, -1)} title="حرّك للشمال"><ArrowLeft className="w-4 h-4" /></button>
              <button type="button" className={btnGhost} disabled={i === spec.blocks.length - 1} onClick={() => move(i, 1)} title="حرّك لليمين"><ArrowRight className="w-4 h-4" /></button>
              <button type="button" className={btnGhost} disabled={spec.blocks.length <= 1} onClick={() => removeBlock(i)} aria-label="امسح البلوك"><Trash2 className="w-4 h-4 text-red-600 dark:text-red-300" /></button>
            </div>
          </div>
        ))}
        <button className={btnGhost} disabled={spec.blocks.length >= MAX_BLOCKS} onClick={addBlock}><Plus className="w-4 h-4" /> بلوك جديد</button>
      </div>

      <Preview spec={spec} />

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line">
        <button className={btnPrimary} disabled={busy} onClick={apply}><Wand2 className="w-4 h-4" /> طبّق التصميم</button>
        <p className="text-xs text-muted flex-1 leading-relaxed">«ممر كل» بيحط ممر جوه البلوك بعد كل عدد الكراسي ده (0 = مفيش). التصميم بيتحفظ باسم وتقدر تستخدمه في أي إيفينت.</p>
      </div>
    </div>
  )
}

function Num({ label, value, min, max, onChange, w = 'w-20' }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void; w?: string
}) {
  return (
    <label className="text-xs text-muted">{label}
      <input type="number" min={min} max={max} value={value} className={`${inputCls} ${w} mt-1 !py-2`}
        onChange={(e) => { const n = e.target.valueAsNumber; onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : 0) }} />
    </label>
  )
}

function Preview({ spec }: { spec: LayoutSpec }) {
  return (
    <div className="rounded-2xl bg-slate-900 text-white p-3 overflow-x-auto">
      <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 mb-2">
        <span>معاينة — زي ما هتظهر في القاعة</span>
        <span className="tabular-nums">{spec.rows} صف · {specSeats(spec)} كرسي</span>
      </div>
      <div dir="ltr" className="flex items-end gap-4 min-w-max">
        {spec.blocks.map((b, bi) => (
          <div key={bi} className="text-center">
            <div className="text-[11px] font-black text-slate-300 mb-1">{b.key}</div>
            <div className="flex items-end gap-[3px]">
              {Array.from({ length: Math.min(24, Math.max(1, b.seats)) }).map((_, i) => (
                <Fragment key={i}>
                  {i > 0 && b.aisleEvery > 0 && i % b.aisleEvery === 0 && <span className="w-2.5" />}
                  <span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500/80" />
                </Fragment>
              ))}
              {b.seats > 24 && <span className="text-[10px] text-slate-400">+{b.seats - 24}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
