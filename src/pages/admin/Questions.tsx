import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSpreadsheet, ListChecks, Plus, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLive } from '../../lib/live'
import { fuzzySearch, queryTokens } from '../../lib/search'
import { isEssay, type QuestionRow } from '../../lib/questionType'
import { storagePathFromUrl } from '../../lib/image'
import AdminLayout from '../../components/admin/AdminLayout'
import QuestionCard from '../../components/admin/QuestionCard'
import QuestionEditor from '../../components/admin/QuestionEditor'
import { confirmDialog, toast } from '../../components/admin/feedback'

type Filter = 'all' | 'mcq' | 'essay'

export default function AdminQuestions() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [filter, setFilter] = useState<Filter>('all')
  const [editor, setEditor] = useState<{ q: QuestionRow | null } | null>(null)

  const { data, loading, connected, reload } = useLive(
    async () => {
      const [ex, qs] = await Promise.all([
        supabase.from('exams').select('name, course_id').eq('id', examId).single(),
        supabase.from('questions').select('*').eq('exam_id', examId).order('order_index', { ascending: true }),
      ])
      let courseName = ''
      if (ex.data?.course_id) {
        const c = await supabase.from('courses').select('name').eq('id', ex.data.course_id).single()
        courseName = c.data?.name || ''
      }
      return { examName: (ex.data?.name as string) || '', courseId: (ex.data?.course_id as string) || '', courseName, questions: (qs.data || []) as QuestionRow[] }
    },
    ['questions', 'exams']
  )

  const all = data?.questions || []
  const tokens = useMemo(() => queryTokens(deferred), [deferred])

  const numbered = useMemo(() => all.map((q, i) => ({ q, n: i + 1 })), [all])
  const visible = useMemo(() => {
    let list = numbered
    if (filter !== 'all') list = list.filter((x) => (filter === 'essay') === isEssay(x.q))
    if (tokens.length) {
      const hits = fuzzySearch(list, deferred, (x) => [
        { text: x.q.question_text, weight: 1 },
        { text: [x.q.option_a, x.q.option_b, x.q.option_c, x.q.option_d].filter(Boolean).join(' '), weight: 0.7 },
        { text: x.q.explanation || '', weight: 0.5 },
      ], 500)
      return hits.map((h) => h.item)
    }
    return list
  }, [numbered, filter, deferred, tokens.length])

  const essayCount = all.filter(isEssay).length
  const withImage = all.filter((q) => q.image_url).length

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

  const chip = (v: Filter, label: string, n: number) => (
    <button
      key={v}
      onClick={() => setFilter(v)}
      className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors ${filter === v ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
    >
      {label} <span className={filter === v ? 'text-slate-300' : 'text-slate-400'}>{n}</span>
    </button>
  )

  return (
    <AdminLayout
      title={data?.examName || 'الأسئلة'}
      subtitle={data?.courseName ? `${data.courseName} › تعديل الأسئلة` : 'تعديل الأسئلة'}
      live={connected}
      back={{ label: 'رجوع للامتحانات', to: data?.courseId ? `/admin/courses/${data.courseId}/exams` : '/admin/exams' }}
      actions={
        <>
          <button onClick={() => navigate(`/admin/import?examId=${examId}`)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-medium hover:border-emerald-300">
            <FileSpreadsheet className="w-4 h-4" />
            رفع من Excel
          </button>
          <button onClick={() => setEditor({ q: null })} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium shadow-lg shadow-emerald-600/20">
            <Plus className="w-4 h-4" />
            ضيف سؤال
          </button>
        </>
      }
    >
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 mb-5 space-y-3">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="دوّر في أسئلة الامتحان ده..."
            className="w-full pr-12 pl-4 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:bg-white focus:border-emerald-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {chip('all', 'الكل', all.length)}
          {chip('mcq', 'اختيار من متعدد', all.length - essayCount)}
          {chip('essay', 'مقالي', essayCount)}
          {withImage > 0 && <span className="text-xs text-slate-400 mr-auto">{withImage} سؤال بصورة</span>}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-3xl bg-slate-200/60 animate-pulse" />)}</div>
      ) : all.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <ListChecks className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-4">مفيش أسئلة في الامتحان ده لسه</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setEditor({ q: null })} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl">ضيف سؤال</button>
            <button onClick={() => navigate(`/admin/import?examId=${examId}`)} className="px-5 py-2.5 bg-white border-2 border-slate-200 rounded-xl">ارفع Excel</button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-3xl border border-slate-200 text-slate-500">مفيش سؤال مطابق للبحث ده</div>
      ) : (
        <div className="space-y-4">
          {visible.map(({ q, n }) => (
            <QuestionCard key={q.id} q={q} number={n} tokens={tokens} onEdit={() => setEditor({ q })} onDelete={() => remove(q)} />
          ))}
        </div>
      )}

      {editor && (
        <QuestionEditor
          question={editor.q}
          examId={examId || ''}
          nextOrder={all.length}
          onClose={() => setEditor(null)}
          onSaved={reload}
        />
      )}
    </AdminLayout>
  )
}
