import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Plus, Search, Trash2, Upload } from 'lucide-react'
import Modal from '../../components/Modal'
import StaffLayout from '../../components/StaffLayout'
import { confirmDialog, toast } from '../../components/feedback'
import { Badge, btnGhost, btnPrimary, card, FullLoader, inputCls, lightInputCls, Spinner } from '../../components/ui'
import { BATCH_AR, batchOf, errText } from '../../lib/api'
import { pageAll, useLive } from '../../lib/live'
import { supabase } from '../../lib/supabase'

interface S { national_id: string; name: string; academic_no: string | null }
interface Parsed { valid: S[]; invalid: Array<{ row: number; why: string }>; duplicates: number; noId: number }
/** a student with no national id yet gets a unique stand-in built from the academic number: 0 + 13 digits (real ids start with 2 or 3) */
const isFiller = (id: string) => id.startsWith('0')

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/\s+/g, '')
const isNidHeader = (h: string) => /قومي|national|nid|^id$|رقم_?قومي/.test(h)
const isNameHeader = (h: string) => /اسم|name/.test(h)
const isAcadHeader = (h: string) => /اكاديمي|academic|كود|code|جلوس|seat/.test(h)

function parseSheet(rows: unknown[][]): Parsed {
  let name = 0, nid = 1, acad = 2, start = 0
  if (rows.length) {
    const h = rows[0].map(norm)
    const ni = h.findIndex(isNameHeader), di = h.findIndex(isNidHeader), ai = h.findIndex(isAcadHeader)
    if (ni >= 0 || di >= 0 || ai >= 0) {
      if (ni >= 0) name = ni; if (di >= 0) nid = di; if (ai >= 0) acad = ai
      start = 1
    }
  }
  const byNid = new Map<string, S>()
  const invalid: Parsed['invalid'] = []
  let duplicates = 0
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || []
    if (r.every((c) => String(c ?? '').trim() === '')) continue
    const n = String(r[name] ?? '').trim()
    let id = String(r[nid] ?? '').replace(/\D/g, '')
    const a = String(r[acad] ?? '').trim()
    const aDigits = a.replace(/\D/g, '')
    if (!n) { invalid.push({ row: i + 1, why: 'الاسم فاضي' }); continue }
    if (/^0*$/.test(id)) {
      // blank / 0 / 00000000000000 → no national id yet: the student will enter it at first login
      if (!aDigits || aDigits.length > 13) { invalid.push({ row: i + 1, why: 'مفيش رقم قومي ولا رقم أكاديمي صالح' }); continue }
      id = '0' + aDigits.padStart(13, '0')
    } else if (!/^\d{14}$/.test(id) || isFiller(id)) {
      invalid.push({ row: i + 1, why: `الرقم القومي غير صحيح (${String(r[nid] ?? '')})` }); continue
    }
    if (byNid.has(id)) duplicates++
    byNid.set(id, { national_id: id, name: n, academic_no: a || null })
  }
  const valid = [...byNid.values()]
  return { valid, invalid, duplicates, noId: valid.filter((s) => isFiller(s.national_id)).length }
}

export default function Students() {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', nid: '', acad: '' })
  const [saving, setSaving] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const term = useRef('')
  term.current = search.replace(/[,()%*]/g, ' ').trim()

  const { data, loading, reload } = useLive(async () => {
    let q = supabase.from('students').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(100)
    if (term.current) q = q.or(`name.ilike.%${term.current}%,national_id.ilike.%${term.current}%,academic_no.ilike.%${term.current}%`)
    const { data, count, error } = await q
    if (error) throw error
    return { rows: (data || []) as S[], count: count ?? 0 }
  }, ['students'], 20000)

  useEffect(() => { const t = window.setTimeout(() => void reload(), 300); return () => window.clearTimeout(t) }, [search, reload])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setParsed(parseSheet(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })))
    } catch { toast('الملف مش مقروء — لازم يكون Excel أو CSV', 'error') }
    if (fileRef.current) fileRef.current.value = ''
  }

  const doImport = async () => {
    if (!parsed?.valid.length) return
    setProgress(0)
    try {
      // who is already in the database? (so re-importing never makes a second row for the same student)
      const existing = await pageAll<{ national_id: string; academic_no: string | null }>((f, t) => supabase.from('students').select('national_id,academic_no').range(f, t))
      const byAcad = new Map<string, string[]>()
      for (const e of existing) { const k = (e.academic_no || '').trim(); if (k) byAcad.set(k, [...(byAcad.get(k) || []), e.national_id]) }
      const replace: string[] = []                 // stand-in rows that a real national id now replaces
      let skipped = 0
      const rows = parsed.valid.filter((st) => {
        const k = (st.academic_no || '').trim()
        const others = k ? (byAcad.get(k) || []).filter((id) => id !== st.national_id) : []
        if (isFiller(st.national_id)) { if (others.length) { skipped++; return false } return true }   // already there (maybe with a real id)
        others.filter(isFiller).forEach((id) => replace.push(id))
        return true
      })
      for (let i = 0; i < replace.length; i += 200) {
        const chunk = replace.slice(i, i + 200)
        const { error } = await supabase.from('students').delete().in('national_id', chunk)
        if (error) for (const id of chunk) await supabase.from('students').delete().eq('national_id', id)   // one with a booking can't go; the rest do
      }
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('students').upsert(rows.slice(i, i + 500), { onConflict: 'national_id' })
        if (error) throw error
        setProgress(Math.min(100, Math.round(((i + 500) / rows.length) * 100)))
      }
      toast(`اتضاف/اتحدث ${rows.length} طالب ✅${skipped ? ` — ${skipped} كانوا موجودين قبل كده` : ''}`); setParsed(null); void reload()
    } catch (e) { toast(errText(e), 'error') } finally { setProgress(null) }
  }

  const addOne = async () => {
    const id = form.nid.replace(/\D/g, '')
    if (!form.name.trim() || !/^\d{14}$/.test(id)) return toast('الاسم والرقم القومي (14 رقم) مطلوبين', 'error')
    setSaving(true)
    const { error } = await supabase.from('students').upsert({ national_id: id, name: form.name.trim(), academic_no: form.acad.trim() || null }, { onConflict: 'national_id' })
    setSaving(false)
    if (error) return toast(errText(error), 'error')
    toast('اتضاف ✅'); setAdding(false); setForm({ name: '', nid: '', acad: '' }); void reload()
  }

  const remove = async (s: S) => {
    if (!(await confirmDialog({ title: `تمسح ${s.name}؟`, confirmText: 'امسح', danger: true }))) return
    const { error } = await supabase.from('students').delete().eq('national_id', s.national_id)
    if (error) return toast('مينفعش يتمسح — عنده حجز مسجل', 'error')
    void reload()
  }

  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([['الاسم', 'الرقم القومي', 'الرقم الأكاديمي'], ['اسم الطالب', '29901011234567', '2024001']])
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 16 }]
    // keep the national id as TEXT so Excel never turns it into 2.99E+13
    ws['B2'] = { t: 's', v: '29901011234567' }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'الطلاب'); XLSX.writeFile(wb, 'students-template.xlsx')
  }

  return (
    <StaffLayout title="قاعدة الطلاب" roles={['super_admin']} wide
      actions={<>
        <button className={btnGhost} onClick={template}><Download className="w-4 h-4" /> Template Excel</button>
        <button className={btnGhost} onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4" /> import من Excel</button>
        <button className={btnPrimary} onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> إضافة طالب</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </>}>
      <div className="relative mb-4"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input className={`${inputCls} pr-10`} placeholder="بحث بالاسم / الرقم القومي / الأكاديمي" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="text-sm text-muted mb-2">إجمالي المسموح لهم بالحجز: <b className="text-emerald-700 dark:text-emerald-300">{data?.count ?? '…'}</b>{data && data.count > 100 ? ' (بيعرض أول 100)' : ''}</div>

      {loading ? <FullLoader /> : (
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          {(data?.rows || []).map((s) => (
            <div key={s.national_id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0"><div className="font-semibold truncate">{s.name}</div><div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{isFiller(s.national_id) ? 'لسه ما سجّلش رقمه القومي' : s.national_id} · {s.academic_no || '—'}</div></div>
              {batchOf(s.academic_no) && <Badge tone="sky">{BATCH_AR[batchOf(s.academic_no)!]}</Badge>}
              <button className="p-2 text-muted hover:text-red-600 dark:text-red-300" onClick={() => remove(s)}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {!data?.rows.length && <div className="p-8 text-center text-muted">مفيش نتايج</div>}
        </div>
      )}

      {parsed && (
        <Modal title="معاينة الاستيراد" onClose={() => progress === null && setParsed(null)}
          footer={<button className={`${btnPrimary} w-full`} disabled={!parsed.valid.length || progress !== null} onClick={doImport}>{progress !== null ? <><Spinner /> {progress}%</> : `استيراد ${parsed.valid.length} طالب`}</button>}>
          <div className="space-y-3 text-ink">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold">صالح: {parsed.valid.length}</div>
            {parsed.noId > 0 && <div className="p-3 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300 text-sm">{parsed.noId} طالب من غير رقم قومي — هيكتبوه بنفسهم أول ما يدخلوا بالرقم الأكاديمي.</div>}
            {parsed.duplicates > 0 && <div className="p-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm">{parsed.duplicates} صف مكرر اتجاهل (آخر واحد هو اللي اتاخد).</div>}
            {parsed.invalid.length > 0 && (
              <div className="p-3 rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm">
                <b>تم تجاهل {parsed.invalid.length} صف:</b>
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">{parsed.invalid.slice(0, 30).map((i) => <li key={i.row}>صف {i.row}: {i.why}</li>)}</ul>
              </div>
            )}
            <p className="text-xs text-muted">الأعمدة: الاسم، الرقم القومي، الرقم الأكاديمي (بالعناوين أو بنفس الترتيب). الطالب الموجود بنفس الرقم القومي هيتحدث.</p>
          </div>
        </Modal>
      )}

      {adding && (
        <Modal title="إضافة طالب" maxWidth="max-w-md" onClose={() => setAdding(false)} footer={<button className={`${btnPrimary} w-full`} disabled={saving} onClick={addOne}>{saving ? <Spinner /> : 'حفظ'}</button>}>
          <div className="light-modal space-y-3">
            <input className={lightInputCls} placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={lightInputCls} dir="ltr" inputMode="numeric" maxLength={14} placeholder="الرقم القومي (14 رقم)" value={form.nid} onChange={(e) => setForm({ ...form, nid: e.target.value.replace(/\D/g, '') })} />
            <input className={lightInputCls} dir="ltr" placeholder="الرقم الأكاديمي" value={form.acad} onChange={(e) => setForm({ ...form, acad: e.target.value })} />
          </div>
        </Modal>
      )}
    </StaffLayout>
  )
}
