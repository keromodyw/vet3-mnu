import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Question {
  id: string
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: string
  explanation: string | null
  order_index: number
}

export default function AdminQuestions() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<Question[]>([])
  const [examName, setExamName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    question_text: '', option_a: '', option_b: '', option_c: '', option_d: '',
    correct_answer: 'A', explanation: ''
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth')
    if (auth !== 'true') {
      navigate('/admin/login')
      return
    }
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [{ data: exam }, { data: questionsData }] = await Promise.all([
        supabase.from('exams').select('name').eq('id', examId).single(),
        supabase.from('questions').select('*').eq('exam_id', examId).order('order_index')
      ])
      if (exam) setExamName(exam.name)
      setQuestions(questionsData || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        const { error } = await supabase.from('questions').update(formData).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('questions').insert({
          ...formData,
          exam_id: examId,
          order_index: questions.length
        })
        if (error) throw error
      }
      setShowModal(false)
      setFormData({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A', explanation: '' })
      setEditingId(null)
      fetchData()
    } catch (error) {
      alert('حدث خطأ')
    }
  }

  const handleEdit = (q: Question) => {
    setFormData({
      question_text: q.question_text,
      option_a: q.option_a || '',
      option_b: q.option_b || '',
      option_c: q.option_c || '',
      option_d: q.option_d || '',
      correct_answer: q.correct_answer,
      explanation: q.explanation || ''
    })
    setEditingId(q.id)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السؤال؟')) return
    try {
      const { error } = await supabase.from('questions').delete().eq('id', id)
      if (error) throw error
      fetchData()
    } catch (error) {
      alert('حدث خطأ')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-slate-900">إدارة الأسئلة</h1>
                <p className="text-xs text-slate-500">{examName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/admin/import?examId=${examId}`)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50">
                <FileSpreadsheet className="w-4 h-4" />
                تحميل الأسئلة من ملف Excel
              </button>
              <button onClick={() => { setShowModal(true); setFormData({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A', explanation: '' }); setEditingId(null) }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
                <Plus className="w-4 h-4" />
                إضافة سؤال
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : questions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl">
            <p className="text-slate-600">لا توجد أسئلة بعد</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                      {idx + 1}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">الإجابة: {q.correct_answer}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEdit(q)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(q.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-slate-900 font-medium mb-4">{q.question_text}</p>
                <div className="space-y-2 text-sm">
                  {q.option_a && <div className="p-2 bg-slate-50 rounded-lg">أ: {q.option_a}</div>}
                  {q.option_b && <div className="p-2 bg-slate-50 rounded-lg">ب: {q.option_b}</div>}
                  {q.option_c && <div className="p-2 bg-slate-50 rounded-lg">ج: {q.option_c}</div>}
                  {q.option_d && <div className="p-2 bg-slate-50 rounded-lg">د: {q.option_d}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">{editingId ? 'تعديل سؤال' : 'إضافة سؤال'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نص السؤال *</label>
                <textarea
                  value={formData.question_text}
                  onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  rows={3}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الخيار أ</label>
                  <input type="text" value={formData.option_a} onChange={(e) => setFormData({ ...formData, option_a: e.target.value })} className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الخيار ب</label>
                  <input type="text" value={formData.option_b} onChange={(e) => setFormData({ ...formData, option_b: e.target.value })} className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الخيار ج</label>
                  <input type="text" value={formData.option_c} onChange={(e) => setFormData({ ...formData, option_c: e.target.value })} className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الخيار د</label>
                  <input type="text" value={formData.option_d} onChange={(e) => setFormData({ ...formData, option_d: e.target.value })} className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">الإجابة الصحيحة *</label>
                <select value={formData.correct_answer} onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })} className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none">
                  <option value="A">أ</option>
                  <option value="B">ب</option>
                  <option value="C">ج</option>
                  <option value="D">د</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">شرح الإجابة (اختياري)</label>
                <textarea
                  value={formData.explanation}
                  onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-xl">حفظ</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
