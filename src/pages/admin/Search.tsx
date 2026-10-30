import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, Search as SearchIcon, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchAll, useLive } from '../../lib/live'
import { fuzzySearch, queryTokens } from '../../lib/search'
import type { QuestionRow } from '../../lib/questionType'
import { storagePathFromUrl } from '../../lib/image'
import AdminLayout from '../../components/admin/AdminLayout'
import QuestionCard from '../../components/admin/QuestionCard'
import QuestionEditor from '../../components/admin/QuestionEditor'
import { confirmDialog, toast } from '../../components/admin/feedback'

export default function AdminSearch() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const deferred = useDeferredValue(query)
  const [examFilter, setExamFilter] = useState('')
  const [editing, setEditing] = useState<QuestionRow | null>(null)

  // follow the header search box (?q=...)
  useEffect(() => {
    const q = params.get('q')
    if (q !== null && q !== query) setQuery(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const { data, loading, connected, reload } = useLive(
    async () => {
      const [questions, exams, courses] = await Promise.all([
        fetchAll<QuestionRow>('questions', '*', 'created_at'),
        supabase.from('exams').select('id,name,course_id').order('name'),
        supabase.from('courses').select('id,name'),
      ])
      const courseName: Record<string, string> = {}
      ;(courses.data || []).forEach((c: any) => { courseName[c.id] = c.name })
      const examInfo: Record<string, { name: string; course: string }> = {}
      ;(exams.data || []).forEach((e: any) => { examInfo[e.id] = { name: e.name, course: courseName[e.course_id] || '' } })
      return { questions, exams: (exams.data || []) as { id: string; name: string }[], examInfo }
    },
    ['questions', 'exams', 'courses'],
    30000
  )

  const tokens = useMemo(() => queryTokens(deferred), [deferred])

  const results = useMemo(() => {
    if (!data || tokens.length === 0) return []
    const pool = examFilter ? data.questions.filter((q) => q.exam_id === examFilter) : data.questions
    return fuzzySearch(pool, deferred, (q) => [
      { text: q.question_text, weight: 1 },
      { text: [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean).join(' '), weight: 0.7 },
      { text: q.explanation || '', weight: 0.5 },
    ], 80)
  }, [data, deferred, tokens.length, examFilter])

  const onType = (v: string) => {
    setQuery(v)
    setParams(v.trim() ? { q: v } : {}, { replace: true })
  }

  const remove = async (q: QuestionRow) => {
    const ok = await confirmDialog({ title: 'تمسح السؤال ده؟', message: 'مش هتقدر ترجعه تاني.', confirmText: 'امسح', danger: true })
    if (!ok) return
    try {
      const { error } = await supabase.from('questions').delete().eq('id', q.id)
      if (error) throw error
      const path = storagePathFromUrl(q.image_url)
      if (path) await supabase.storage.from('images').remove([path])
      toast('السؤال اتمسح')
      reload()
    } catch (err: any) {
      toast(err?.message || 'حصلت مشكلة', 'error')
    }
  }

  return (
    <AdminLayout title="دوّر في الأسئلة" subtitle="بحث في كل الامتحانات وتعديل مباشر" live={connected}>
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-6">
        <div className="relative">
          <SearchIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onType(e.target.value)}
            placeholder="اكتب أي كلمة من السؤال أو الاختيارات أو الشرح..."
            className="w-full pr-12 pl-4 py-4 text-lg rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:border-emerald-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm focus:border-emerald-400 focus:outline-none bg-white max-w-full"
          >
            <option value="">كل الامتحانات</option>
            {(data?.exams || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            البحث بيتجاهل التشكيل والهمزات (أ/ا) و(ة/ه) و(ى/ي)، وبيلقط غلطات الكتابة الصغيرة
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">بيحمّل الأسئلة...</div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <SearchIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">ابدأ اكتب علشان تدوّر في <b>{(data?.questions.length || 0).toLocaleString('en-US')}</b> سؤال</p>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <p className="text-slate-600 mb-1">مفيش نتايج لـ "{deferred}"</p>
          <p className="text-sm text-slate-400">جرّب كلمة أقصر أو شيل فلتر الامتحان</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-3">{results.length} نتيجة{results.length === 80 ? ' (أول 80)' : ''} · الأقرب الأول</p>
          <div className="space-y-4">
            {results.map(({ item: q }) => {
              const info = data?.examInfo[q.exam_id]
              return (
                <div key={q.id} className="relative">
                  <QuestionCard
                    q={q}
                    tokens={tokens}
                    crumb={info ? `${info.course ? info.course + ' › ' : ''}${info.name}` : ''}
                    onEdit={() => setEditing(q)}
                    onDelete={() => remove(q)}
                  />
                  <button
                    onClick={() => navigate(`/admin/exams/${q.exam_id}/questions`)}
                    className="absolute bottom-4 left-4 flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-700"
                  >
                    افتح الامتحان
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {editing && <QuestionEditor question={editing} examId={editing.exam_id} onClose={() => setEditing(null)} onSaved={reload} />}
    </AdminLayout>
  )
}
