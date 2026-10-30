import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Eraser, Flag, LayoutGrid, X, ZoomIn } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { shuffleArray } from '../utils/helpers'

type Key = 'A' | 'B' | 'C' | 'D'

interface Question {
  id: string
  exam_id: string
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: Key
  explanation: string | null
  image_url: string | null
}

interface Option {
  originalKey: Key
  text: string
}

interface ExamQuestion extends Question {
  options: Option[]
}

const LETTERS = ['أ', 'ب', 'ج', 'د']

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? m.toString().padStart(2, '0') : m.toString()
  return `${h > 0 ? h + ':' : ''}${mm}:${sec.toString().padStart(2, '0')}`
}

export default function Quiz() {
  const { examId } = useParams()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [examName, setExamName] = useState('')

  const [phase, setPhase] = useState<'intro' | 'running'>('intro')
  const [mode, setMode] = useState<'instant' | 'exam'>('instant')

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Key>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())

  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    fetchQuestions()
  }, [examId])

  useEffect(() => {
    if (phase !== 'running') return
    startRef.current = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [phase])

  const fetchQuestions = async () => {
    try {
      const { data: exam } = await supabase.from('exams').select('name').eq('id', examId).single()
      if (exam) setExamName(exam.name)

      const { data, error } = await supabase.from('questions').select('*').eq('exam_id', examId)
      if (error) throw error

      const processed: ExamQuestion[] = shuffleArray<Question>(data || []).map((q) => {
        const pool: Option[] = []
        if (q.option_a) pool.push({ originalKey: 'A', text: q.option_a })
        if (q.option_b) pool.push({ originalKey: 'B', text: q.option_b })
        if (q.option_c) pool.push({ originalKey: 'C', text: q.option_c })
        if (q.option_d) pool.push({ originalKey: 'D', text: q.option_d })
        return { ...q, options: shuffleArray(pool) }
      })
      setQuestions(processed)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const total = questions.length
  const q = questions[currentIndex]
  const answeredCount = questions.filter((x) => answers[x.id]).length
  const remaining = total - answeredCount
  const allAnswered = total > 0 && remaining === 0
  const progress = total > 0 ? (answeredCount / total) * 100 : 0
  const locked = !!q && mode === 'instant' && !!answers[q.id]
  const firstUnanswered = questions.findIndex((x) => !answers[x.id])

  const goTo = (i: number) => {
    setCurrentIndex(Math.max(0, Math.min(total - 1, i)))
    setDrawerOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const goNext = () => goTo(currentIndex + 1)
  const goPrev = () => goTo(currentIndex - 1)

  const select = (key: Key) => {
    if (!q || locked) return
    setAnswers((prev) => ({ ...prev, [q.id]: key }))
  }

  const clearAnswer = () => {
    if (!q || mode !== 'exam') return
    setAnswers((prev) => {
      const next = { ...prev }
      delete next[q.id]
      return next
    })
  }

  const toggleFlag = () => {
    if (!q) return
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.add(q.id)
      return next
    })
  }

  const finishQuiz = () => {
    if (!allAnswered) return
    let correct = 0
    const details = questions.map((x) => {
      const userAnswer = answers[x.id] || null
      const isCorrect = userAnswer === x.correct_answer
      if (isCorrect) correct++
      return { questionId: x.id, userAnswer, correctAnswer: x.correct_answer, isCorrect }
    })
    const result = {
      examId,
      totalQuestions: total,
      correctAnswers: correct,
      wrongAnswers: total - correct,
      score: Math.round((correct / total) * 100),
      answers: details,
      examName,
      timeTaken: Math.floor((Date.now() - startRef.current) / 1000),
    }
    navigate('/results', { state: { result, questions } })
  }

  // keyboard shortcuts: ← next, → previous (RTL), 1-4 pick option, F flag
  useEffect(() => {
    if (phase !== 'running') return
    const onKey = (e: KeyboardEvent) => {
      if (finishOpen || exitOpen || lightbox) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') goNext()
      else if (e.key === 'ArrowRight') goPrev()
      else if (e.key.toLowerCase() === 'f') toggleFlag()
      else {
        const idx = '1234'.indexOf(e.key)
        if (idx >= 0 && q?.options[idx]) select(q.options[idx].originalKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // warn before closing the tab mid-exam
  useEffect(() => {
    if (phase !== 'running' || answeredCount === 0) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase, answeredCount])

  /* ---------------------------- states ---------------------------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">جاري تحميل الأسئلة...</p>
        </div>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md w-full shadow-xl shadow-slate-200/60">
          <h2 className="text-xl font-bold text-slate-900 mb-2">لا توجد أسئلة</h2>
          <p className="text-slate-600 mb-6">لم يتم إضافة أسئلة لهذا الامتحان بعد</p>
          <button onClick={() => navigate('/')} className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium">
            العودة للرئيسية
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    const modeCard = (m: 'instant' | 'exam', title: string, desc: string, badge: string) => (
      <button
        onClick={() => { setMode(m); setPhase('running') }}
        className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/60 transition-all text-start group"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-900 group-hover:text-emerald-800">{title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{badge}</span>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
      </button>
    )
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-300/40 max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-7 text-center">
            <h1 className="text-2xl font-bold text-white mb-3">{examName}</h1>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-emerald-50 text-sm">
              {total} سؤال
            </div>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-slate-500 text-center mb-1">اختار طريقة الحل</p>
            {modeCard('instant', 'إجابات مباشرة', 'تعرف صح ولا غلط وتشوف الشرح فور ما تختار إجابة', 'للمذاكرة')}
            {modeCard('exam', 'نظام الامتحان', 'تحل براحتك وتقدر تغيّر إجاباتك، والنتيجة والشرح في الآخر', 'زي الامتحان')}
            <button onClick={() => navigate('/')} className="w-full py-2 text-slate-500 hover:text-slate-900 text-sm">
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* --------------------------- navigator --------------------------- */

  const navigatorPanel = (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900">الأسئلة</h3>
        <span className="text-xs text-slate-500">{answeredCount}/{total}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="rounded-xl bg-emerald-50 py-2">
          <div className="text-lg font-bold text-emerald-700 leading-none">{answeredCount}</div>
          <div className="text-[11px] text-emerald-700 mt-1">تم حلها</div>
        </div>
        <div className="rounded-xl bg-slate-50 py-2">
          <div className="text-lg font-bold text-slate-700 leading-none">{remaining}</div>
          <div className="text-[11px] text-slate-600 mt-1">متبقية</div>
        </div>
        <div className="rounded-xl bg-orange-50 py-2">
          <div className="text-lg font-bold text-orange-600 leading-none">{flagged.size}</div>
          <div className="text-[11px] text-orange-600 mt-1">عليها علامة</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 max-h-[46vh] overflow-y-auto p-1">
        {questions.map((x, i) => {
          const a = answers[x.id]
          const isFlagged = flagged.has(x.id)
          const isCurrent = i === currentIndex
          let color = 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
          if (a) {
            if (mode === 'instant') color = a === x.correct_answer ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-500 text-white border-red-500'
            else color = 'bg-emerald-600 text-white border-emerald-600'
          }
          return (
            <button
              key={x.id}
              onClick={() => goTo(i)}
              className={`relative h-10 rounded-lg border-2 text-sm font-bold transition-all ${color} ${isCurrent ? 'ring-2 ring-offset-2 ring-slate-900' : ''}`}
            >
              {i + 1}
              {isFlagged && (
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center">
                  <Flag className="w-2 h-2 text-white" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
        {!allAnswered && firstUnanswered >= 0 && (
          <button onClick={() => goTo(firstUnanswered)} className="w-full py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">
            اذهب لأول سؤال لم يُحل
          </button>
        )}
        <button
          onClick={() => { setDrawerOpen(false); setFinishOpen(true) }}
          disabled={!allAnswered}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {allAnswered ? 'إنهاء الامتحان' : `باقي ${remaining} سؤال للإنهاء`}
        </button>
      </div>
    </div>
  )

  /* ---------------------------- main UI ---------------------------- */

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => (answeredCount > 0 ? setExitOpen(true) : navigate('/'))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="خروج"
            >
              <X className="w-5 h-5" />
            </button>
            <h1 className="flex-1 min-w-0 text-center font-bold text-slate-900 text-sm sm:text-base truncate">{examName}</h1>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold tabular-nums" dir="ltr">
              <Clock className="w-4 h-4" />
              {formatTime(elapsed)}
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-600/30 active:scale-95"
              aria-label="قائمة الأسئلة"
            >
              <LayoutGrid className="w-4 h-4" />
              الأسئلة
              {flagged.size > 0 && <span className="w-2 h-2 rounded-full bg-orange-400" />}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">تم حل {answeredCount} من {total}</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 mt-5 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
        {/* Question card */}
        <main key={q.id} className="q-enter">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-5 sm:p-8">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold">
                السؤال {currentIndex + 1} <span className="text-emerald-400">/</span> {total}
              </span>
              <button
                onClick={toggleFlag}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors ${
                  flagged.has(q.id)
                    ? 'bg-orange-50 border-orange-400 text-orange-600'
                    : 'border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600'
                }`}
              >
                <Flag className="w-4 h-4" fill={flagged.has(q.id) ? 'currentColor' : 'none'} />
                {flagged.has(q.id) ? 'عليه علامة' : 'علّم للمراجعة'}
              </button>
            </div>

            <h2 dir="auto" className="text-xl sm:text-2xl font-bold text-slate-900 leading-relaxed text-start whitespace-pre-line">
              {q.question_text}
            </h2>

            {q.image_url && (
              <button onClick={() => setLightbox(q.image_url)} className="relative block mt-5 group">
                <img src={q.image_url} alt="صورة السؤال" className="max-w-full max-h-80 rounded-2xl border border-slate-200 mx-auto" />
                <span className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-black/50 text-white opacity-80 group-hover:opacity-100">
                  <ZoomIn className="w-4 h-4" />
                </span>
              </button>
            )}

            <div className="mt-6 space-y-3">
              {q.options.map((opt, idx) => {
                const isSel = answers[q.id] === opt.originalKey
                const isCorrect = opt.originalKey === q.correct_answer
                let style = 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40'
                let badge = 'bg-slate-100 text-slate-600'
                if (locked) {
                  if (isCorrect) { style = 'border-emerald-500 bg-emerald-50'; badge = 'bg-emerald-600 text-white' }
                  else if (isSel) { style = 'border-red-400 bg-red-50'; badge = 'bg-red-500 text-white' }
                  else { style = 'border-slate-200 bg-white opacity-60' }
                } else if (isSel) {
                  style = 'border-emerald-600 bg-emerald-50 shadow-md shadow-emerald-600/10'
                  badge = 'bg-emerald-600 text-white'
                }
                return (
                  <button
                    key={opt.originalKey}
                    onClick={() => select(opt.originalKey)}
                    disabled={locked}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-start transition-all ${style} ${locked ? 'cursor-default' : 'active:scale-[0.99]'}`}
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${badge}`}>
                      {LETTERS[idx]}
                    </span>
                    <span dir="auto" className="flex-1 text-base sm:text-lg text-slate-900 text-start leading-relaxed">{opt.text}</span>
                    {locked && isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />}
                    {locked && isSel && !isCorrect && <X className="w-6 h-6 text-red-500 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>

            {mode === 'exam' && answers[q.id] && (
              <button onClick={clearAnswer} className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
                <Eraser className="w-4 h-4" />
                مسح الإجابة
              </button>
            )}

            {locked && q.explanation && (
              <div className="mt-5 p-4 rounded-2xl bg-blue-50 border border-blue-200">
                <p className="text-sm font-bold text-blue-900 mb-1">شرح الإجابة</p>
                <p dir="auto" className="text-sm text-blue-800 leading-relaxed text-start whitespace-pre-line">{q.explanation}</p>
              </div>
            )}
          </div>

        </main>

        {/* Desktop navigator */}
        <aside className="hidden lg:block sticky top-28">{navigatorPanel}</aside>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-lg border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
          >
            <ChevronRight className="w-5 h-5" />
            <span className="hidden sm:inline">السابق</span>
          </button>

          <div className="flex-1 min-w-0">
            {allAnswered ? (
              <button onClick={() => setFinishOpen(true)} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-lg shadow-emerald-600/25">
                إنهاء الامتحان
              </button>
            ) : (
              <button
                onClick={() => firstUnanswered >= 0 && goTo(firstUnanswered)}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium truncate px-2"
              >
                باقي {remaining} سؤال · اذهب لأول سؤال لم يُحل
              </button>
            )}
          </div>

          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="flex items-center gap-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
          >
            <span className="hidden sm:inline">التالي</span>
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setDrawerOpen(false)} />}
      <div className={`lg:hidden fixed inset-y-0 right-0 z-50 w-80 max-w-[88vw] bg-slate-50 p-3 overflow-y-auto transition-transform duration-200 ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <button onClick={() => setDrawerOpen(false)} className="mb-2 p-2 rounded-lg hover:bg-slate-200" aria-label="إغلاق">
          <X className="w-5 h-5" />
        </button>
        {navigatorPanel}
      </div>

      {/* Finish confirmation */}
      {finishOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setFinishOpen(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-slate-900 mb-1">تسليم الامتحان؟</h3>
            <p className="text-sm text-slate-500 mb-4">بعد التسليم مش هتقدر تغيّر إجاباتك.</p>
            <div className="grid grid-cols-3 gap-2 text-center mb-5">
              <div className="rounded-xl bg-emerald-50 py-3">
                <div className="text-xl font-bold text-emerald-700">{answeredCount}</div>
                <div className="text-xs text-emerald-700">تم حلها</div>
              </div>
              <div className="rounded-xl bg-orange-50 py-3">
                <div className="text-xl font-bold text-orange-600">{flagged.size}</div>
                <div className="text-xs text-orange-600">عليها علامة</div>
              </div>
              <div className="rounded-xl bg-slate-50 py-3">
                <div className="text-xl font-bold text-slate-700 tabular-nums" dir="ltr">{formatTime(elapsed)}</div>
                <div className="text-xs text-slate-600">الوقت</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFinishOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium">راجع تاني</button>
              <button onClick={finishQuiz} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold">تسليم</button>
            </div>
          </div>
        </div>
      )}

      {/* Exit confirmation */}
      {exitOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setExitOpen(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-slate-900 mb-1">تخرج من الامتحان؟</h3>
            <p className="text-sm text-slate-500 mb-5">إجاباتك مش هتتحفظ لو خرجت دلوقتي.</p>
            <div className="flex gap-2">
              <button onClick={() => setExitOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium">كمّل</button>
              <button onClick={() => navigate('/')} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold">خروج</button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 left-4 p-2 rounded-full bg-white/15 text-white" aria-label="إغلاق">
            <X className="w-6 h-6" />
          </button>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  )
}
