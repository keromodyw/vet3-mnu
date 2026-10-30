import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/admin/AdminLayout'
import { toast } from '../../components/admin/feedback'

interface ParsedRow {
  row: number
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation: string | null
  image_url: string | null
  question_type: 'mcq' | 'essay'
}
interface RowError { row: number; reason: string }

const HEADERS = ['ID', 'السؤال', 'أ', 'ب', 'ج', 'د', 'الإجابة الصحيحة', 'الشرح', 'رابط الصورة']

const LETTER_MAP: Record<string, 'A' | 'B' | 'C' | 'D'> = {
  A: 'A', B: 'B', C: 'C', D: 'D',
  'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D',
  '1': 'A', '2': 'B', '3': 'C', '4': 'D',
}

const cell = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([HEADERS])
  ws['!cols'] = [{ wch: 6 }, { wch: 50 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 16 }, { wch: 40 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws, 'الأسئلة')

  const help = XLSX.utils.aoa_to_sheet([
    ['تعليمات الملء'],
    [''],
    ['• كل صف = سؤال. اكتب من الصف التاني (الصف الأول عناوين).'],
    ['• السؤال الاختياري: املا أ و ب (وج ود لو عايز) واكتب حرف الإجابة الصح في "الإجابة الصحيحة" (A أو B أو C أو D، أو أ/ب/ج/د).'],
    ['• السؤال المقالي: اكتب الإجابة النموذجية في عمود "أ" بس، وسيب ب وج ود فاضيين، واكتب A في "الإجابة الصحيحة".'],
    ['• الشرح ورابط الصورة اختياريين.'],
  ])
  help['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, help, 'تعليمات')
  XLSX.writeFile(wb, 'template-questions.xlsx')
}

function parseSheet(rows: unknown[][]): { ok: ParsedRow[]; errors: RowError[] } {
  const ok: ParsedRow[] = []
  const errors: RowError[] = []
  rows.forEach((r, i) => {
    if (i === 0) return // header row
    const rowNo = i + 1
    const text = cell(r[1])
    const a = cell(r[2]), b = cell(r[3]), c = cell(r[4]), d = cell(r[5])
    if (!text && !a && !b && !c && !d) return // empty line
    if (!text) return errors.push({ row: rowNo, reason: 'نص السؤال فاضي' })

    const explanation = cell(r[7]) || null
    const image_url = cell(r[8]) || null

    // essay: only column "أ" is filled
    if (a && !b && !c && !d) {
      return ok.push({ row: rowNo, question_text: text, option_a: a, option_b: null, option_c: null, option_d: null, correct_answer: 'A', explanation, image_url, question_type: 'essay' })
    }

    const filled = [a, b, c, d].filter(Boolean).length
    if (filled < 2) return errors.push({ row: rowNo, reason: 'محتاج اختيارين على الأقل (أو مقالي: عمود أ بس)' })

    const letter = LETTER_MAP[cell(r[6]).toUpperCase()]
    if (!letter) return errors.push({ row: rowNo, reason: 'الإجابة الصحيحة مش مكتوبة صح (A/B/C/D)' })
    const chosen = { A: a, B: b, C: c, D: d }[letter]
    if (!chosen) return errors.push({ row: rowNo, reason: `الإجابة الصحيحة ${letter} بس الاختيار ده فاضي` })

    ok.push({ row: rowNo, question_text: text, option_a: a || null, option_b: b || null, option_c: c || null, option_d: d || null, correct_answer: letter, explanation, image_url, question_type: 'mcq' })
  })
  return { ok, errors }
}

export default function AdminImport() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exams, setExams] = useState<{ id: string; name: string; course: string }[]>([])
  const [examId, setExamId] = useState(params.get('examId') || '')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<{ ok: ParsedRow[]; errors: RowError[] } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [failures, setFailures] = useState<RowError[]>([])
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [e, c] = await Promise.all([supabase.from('exams').select('id,name,course_id').order('name'), supabase.from('courses').select('id,name')])
      const cn: Record<string, string> = {}
      ;(c.data || []).forEach((x: any) => { cn[x.id] = x.name })
      setExams((e.data || []).map((x: any) => ({ id: x.id, name: x.name, course: cn[x.course_id] || 'بدون مادة' })))
    })()
  }, [])

  const readFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      setFileName(file.name)
      setFailures([])
      setParsed(parseSheet(rows))
    } catch {
      toast('مقدرتش أقرا الملف ده، اتأكد إنه Excel سليم', 'error')
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) readFile(f)
  }

  const describeError = (e: { message?: string; details?: string | null; hint?: string | null }) => {
    const raw = [e.message, e.details, e.hint].filter(Boolean).join(' — ')
    const needsSql = /null value in column|not-null|question_type|violates check/i.test(raw)
    return needsSql ? `${raw}  ➜ شغّل admin_upgrade.sql المحدّث في Supabase` : raw
  }

  const doImport = async () => {
    if (!parsed || parsed.ok.length === 0) return
    if (!examId) return toast('اختار الامتحان الأول', 'error')
    setUploading(true)
    setFailures([])
    try {
      const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('exam_id', examId)
      const start = count || 0
      const payload = parsed.ok.map((r, i) => ({
        exam_id: examId,
        question_text: r.question_text,
        option_a: r.option_a,
        option_b: r.option_b,
        option_c: r.option_c,
        option_d: r.option_d,
        correct_answer: r.correct_answer,
        explanation: r.explanation,
        image_url: r.image_url,
        question_type: r.question_type,
        order_index: start + i,
      }))

      let done = 0
      const failed: RowError[] = []
      for (let i = 0; i < payload.length; i += 100) {
        const chunk = payload.slice(i, i + 100)
        const { error } = await supabase.from('questions').insert(chunk)
        if (!error) { done += chunk.length; continue }
        // the batch was refused: retry one by one to find the exact rows that fail
        for (let j = 0; j < chunk.length; j++) {
          const { error: e2 } = await supabase.from('questions').insert(chunk[j])
          if (e2) failed.push({ row: parsed.ok[i + j].row, reason: describeError(e2) })
          else done++
        }
      }

      if (failed.length === 0) {
        toast(`اترفع ${done} سؤال ✅`)
        navigate(`/admin/exams/${examId}/questions`)
        return
      }
      // keep only the rows that failed so a retry can't duplicate the ones that went through
      const failedRows = new Set(failed.map((f) => f.row))
      setParsed({ ok: parsed.ok.filter((r) => failedRows.has(r.row)), errors: parsed.errors })
      setFailures(failed)
      toast(done > 0 ? `اترفع ${done} سؤال، و${failed.length} فشلوا` : 'مفيش ولا سؤال اترفع', 'error')
    } catch (err: any) {
      setFailures([{ row: 0, reason: describeError(err || {}) || 'حصلت مشكلة غير معروفة' }])
      toast('الرفع فشل، شوف السبب تحت', 'error')
    } finally {
      setUploading(false)
    }
  }

  const essayCount = parsed?.ok.filter((r) => r.question_type === 'essay').length || 0
  const mcqCount = (parsed?.ok.length || 0) - essayCount
  const groups = Array.from(new Set(exams.map((e) => e.course)))

  return (
    <AdminLayout title="رفع أسئلة من Excel" back={{ label: 'رجوع', to: examId ? `/admin/exams/${examId}/questions` : '/admin/exams' }}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="font-bold text-slate-900 mb-3"><span className="inline-flex w-6 h-6 rounded-full bg-emerald-600 text-white text-sm items-center justify-center ml-2">1</span>اختار الامتحان</h3>
            <select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none bg-white">
              <option value="">-- اختار الامتحان --</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {exams.filter((e) => e.course === g).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </optgroup>
              ))}
            </select>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="font-bold text-slate-900 mb-3"><span className="inline-flex w-6 h-6 rounded-full bg-emerald-600 text-white text-sm items-center justify-center ml-2">2</span>ارفع الملف</h3>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f) }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer flex flex-col items-center gap-2 py-10 rounded-2xl border-2 border-dashed transition-colors ${dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40'}`}
            >
              <Upload className="w-8 h-8 text-emerald-600" />
              <p className="text-slate-700 font-medium">{fileName || 'اسحب الملف هنا أو دوس علشان تختار'}</p>
              <p className="text-xs text-slate-400">.xlsx / .xls / .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
            </div>
          </section>

          {parsed && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 q-enter">
              <h3 className="font-bold text-slate-900 mb-4"><span className="inline-flex w-6 h-6 rounded-full bg-emerald-600 text-white text-sm items-center justify-center ml-2">3</span>راجع وارفع</h3>

              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="rounded-xl bg-emerald-50 py-3"><div className="text-2xl font-bold text-emerald-700">{mcqCount}</div><div className="text-xs text-emerald-700">اختيار من متعدد</div></div>
                <div className="rounded-xl bg-violet-50 py-3"><div className="text-2xl font-bold text-violet-700">{essayCount}</div><div className="text-xs text-violet-700">مقالي</div></div>
                <div className={`rounded-xl py-3 ${parsed.errors.length ? 'bg-red-50' : 'bg-slate-50'}`}><div className={`text-2xl font-bold ${parsed.errors.length ? 'text-red-600' : 'text-slate-400'}`}>{parsed.errors.length}</div><div className={`text-xs ${parsed.errors.length ? 'text-red-600' : 'text-slate-400'}`}>صفوف فيها مشكلة</div></div>
              </div>

              {parsed.errors.length > 0 && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50/60 p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2"><XCircle className="w-4 h-4" /> الصفوف دي مش هتترفع:</p>
                  <ul className="text-sm text-red-700 space-y-1">
                    {parsed.errors.slice(0, 50).map((e) => <li key={e.row}>صف {e.row}: {e.reason}</li>)}
                  </ul>
                </div>
              )}

              {parsed.ok.length > 0 && (
                <div className="mb-5 rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {parsed.ok.slice(0, 5).map((r) => (
                    <div key={r.row} className="px-4 py-3 flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span dir="auto" className="flex-1 min-w-0 truncate text-sm text-slate-700 text-start">{r.question_text}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.question_type === 'essay' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>{r.question_type === 'essay' ? 'مقالي' : 'اختياري'}</span>
                    </div>
                  ))}
                  {parsed.ok.length > 5 && <div className="px-4 py-2 text-xs text-slate-400 bg-slate-50">+ {parsed.ok.length - 5} سؤال كمان</div>}
                </div>
              )}

              {failures.length > 0 && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 max-h-56 overflow-y-auto">
                  <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2"><XCircle className="w-4 h-4" /> السيرفر رفض الأسئلة دي:</p>
                  <ul className="text-sm text-red-700 space-y-1 break-words">
                    {failures.slice(0, 10).map((f, i) => <li key={i}>{f.row ? `صف ${f.row}: ` : ''}{f.reason}</li>)}
                  </ul>
                  {failures.length > 10 && <p className="text-xs text-red-500 mt-2">+ {failures.length - 10} صف كمان بنفس المشكلة غالبًا</p>}
                </div>
              )}

              <button
                onClick={doImport}
                disabled={uploading || parsed.ok.length === 0 || !examId}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'بيترفع...' : !examId ? 'اختار الامتحان الأول' : `ارفع ${parsed.ok.length} سؤال`}
              </button>
            </section>
          )}
        </div>

        <aside className="bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-3xl p-6 lg:sticky lg:top-24">
          <FileSpreadsheet className="w-9 h-9 text-emerald-300 mb-3" />
          <h3 className="font-bold text-lg mb-4">لسه معندكش الملف؟</h3>
          <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-slate-900 font-bold hover:bg-emerald-50">
            <Download className="w-4 h-4" />
            تحميل template اكسيل فاضية
          </button>
        </aside>
      </div>
    </AdminLayout>
  )
}
