import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Search, ArrowLeft, Download, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { serverNow, syncServerTime } from '../lib/time'
import { useRealtime } from '../lib/live'
import { printExam } from '../lib/pdf'
import type { QuestionRow } from '../lib/questionType'

interface Exam {
  id: string
  name: string
  subject: string | null
  description?: string | null
  image_url?: string | null
  course_id?: string | null
  publish_at?: string | null
  created_at: string
}

interface Course {
  id: string
  name: string
  image_url?: string | null
}



export default function Home() {
  const navigate = useNavigate()
  const [exams, setExams] = useState<Exam[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('all')
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [selectedExamForPdf, setSelectedExamForPdf] = useState<Exam | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    syncServerTime().then(() => setTick(t => t + 1))
    fetchExams()
    fetchCourses()
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // live: refresh when exams / courses / questions change
  useRealtime(['exams', 'courses', 'questions'], () => {
    fetchExams()
    fetchCourses()
  }, 30000)

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setExams(data || [])
      
      // Fetch question counts (one RPC call; falls back to per-exam counts)
      const counts: Record<string, number> = {}
      const rpc = await supabase.rpc('admin_exam_stats')
      if (!rpc.error && Array.isArray(rpc.data)) {
        ;(rpc.data as { exam_id: string; questions: number }[]).forEach((r) => { counts[r.exam_id] = r.questions })
      } else {
        for (const exam of data || []) {
          const { count } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', exam.id)
          counts[exam.id] = count || 0
        }
      }
      setQuestionCounts(counts)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCourses = async () => {
    try {
      const { data } = await supabase.from('courses').select('*')
      setCourses(data || [])
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const subjects = ['all', ...Array.from(new Set(exams.map(e => e.subject).filter(Boolean)))] as string[]

  const filteredExams = exams.filter(exam => {
    const matchesSearch = exam.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSubject = selectedSubject === 'all' || exam.subject === selectedSubject
    const isPublished = !exam.publish_at || new Date(exam.publish_at).getTime() <= serverNow()
    return matchesSearch && matchesSubject && isPublished
  })

  const getCourseImage = (exam: Exam) => {
    if (exam.image_url) return exam.image_url
    const course = courses.find(c => c.id === exam.course_id)
    if (course?.image_url) return course.image_url
    return null
  }

  const downloadPDF = async (withAnswers: boolean) => {
    if (!selectedExamForPdf) return
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', selectedExamForPdf.id)
      .order('order_index', { ascending: true })

    const opened = printExam(selectedExamForPdf.name, (questions || []) as QuestionRow[], withAnswers)
    if (!opened) alert('المتصفح قفل نافذة الطباعة، اسمح بالـ pop-ups للموقع وجرّب تاني')
    setShowPdfModal(false)
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800" />
        <img 
          src={`${import.meta.env.BASE_URL}hero-cover.jpg`} 
          alt="Hero Cover" 
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="relative max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/95 backdrop-blur-sm mb-6 shadow-2xl p-2">
              <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Yalla Nezaker" className="w-full h-full object-contain rounded-full" />
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">يلا نذاكر؟</h1>
            <p className="text-xl sm:text-2xl text-emerald-50 mb-2">يلا نراجع للامتحان، مفيش وقت 😢</p>
            <p className="text-emerald-100/90 mb-6">Made by Kirolos Mody</p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-50 to-transparent" />
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 -mt-8 pb-12">
        {/* Search and Filter */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-6 mb-8">
          <div className="flex flex-col gap-4">
            <div className="relative w-full">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث عن امتحان..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-12 pl-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>
            {subjects.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">المواد:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {subjects.map((subject) => (
                    <button
                      key={subject}
                      onClick={() => setSelectedSubject(subject)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedSubject === subject
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {subject === 'all' ? 'الكل' : subject}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Exams */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                <div className="h-12 w-12 bg-slate-200 rounded-xl mb-4" />
                <div className="h-6 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-slate-100 rounded w-1/2 mb-4" />
                <div className="h-10 bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="bg-white rounded-2xl text-center py-12">
            <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              {searchTerm || selectedSubject !== 'all' ? 'لا توجد نتائج' : 'لا توجد امتحانات بعد'}
            </h3>
            <p className="text-slate-500">
              {searchTerm || selectedSubject !== 'all' ? 'جرب البحث بكلمات مختلفة' : 'سيتم إضافة الامتحانات قريباً'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredExams.map((exam) => {
              const courseImg = getCourseImage(exam)
              const qCount = questionCounts[exam.id] || 0
              return (
                <div
                  key={exam.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50 hover:shadow-2xl hover:shadow-emerald-600/10 hover:-translate-y-1 transition-all group"
                >
                  <div onClick={() => navigate(`/quiz/${exam.id}`)} className="cursor-pointer">
                    {courseImg ? (
                      <div className="h-40 w-full overflow-hidden">
                        <img src={courseImg} alt={exam.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    ) : (
                      <div className="h-40 w-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-emerald-700" />
                      </div>
                    )}
                    <div className="p-6 pb-4">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors flex-1">
                          {exam.name}
                        </h3>
                        {exam.subject && (
                          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium mr-2">
                            {exam.subject}
                          </span>
                        )}
                      </div>
                      {exam.description ? (
                        <>
                          <p className="text-slate-600 text-sm mb-2 leading-relaxed">{exam.description}</p>
                          <p className="text-slate-500 text-xs mb-4">{qCount} سؤال</p>
                        </>
                      ) : (
                        <p className="text-slate-500 text-sm mb-4">{qCount} سؤال</p>
                      )}
                    </div>
                  </div>
                  <div className="px-6 pb-6 space-y-2">
                    <button onClick={() => navigate(`/quiz/${exam.id}`)} className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium hover:shadow-lg hover:shadow-emerald-600/30 transition-all flex items-center justify-center gap-2">
                      ابدأ الامتحان
                      <ArrowLeft className="w-4 h-4 rotate-180" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedExamForPdf(exam); setShowPdfModal(true) }}
                      className="w-full py-2 px-4 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      تنزيل PDF
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* PDF Modal */}
      {showPdfModal && selectedExamForPdf && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-900 mb-2 text-center">تنزيل PDF</h2>
            <p className="text-slate-600 text-center mb-6">{selectedExamForPdf.name}</p>
            <div className="space-y-3">
              <button
                onClick={() => downloadPDF(false)}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-right"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-slate-600" />
                  <div>
                    <h3 className="font-bold text-slate-900">بدون إجابات</h3>
                    <p className="text-sm text-slate-600">أسئلة فقط للتدريب</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => downloadPDF(true)}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-right"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-emerald-600" />
                  <div>
                    <h3 className="font-bold text-slate-900">مع الإجابات</h3>
                    <p className="text-sm text-slate-600">أسئلة مع الإجابات الصحيحة والشرح</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setShowPdfModal(false)}
                className="w-full py-2 text-slate-600 hover:text-slate-900"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-200/60 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center">
          <p className="text-slate-500 text-sm">Made by Kirolos Mody</p>
        </div>
      </footer>
    </div>
  )
}
