import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Plus, Trash2, Edit, FileSpreadsheet, ImagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { compressImage, storagePathFromUrl } from '../../lib/image'

interface Question {
  id: string
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: string
  explanation: string | null
  image_url: string | null
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const emptyForm = { question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: 'A', explanation: '' }

  const resetImageState = () => {
    setImageFile(null)
    setImagePreview('')
    setExistingImageUrl(null)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('اختار ملف صورة فقط'); return }
    if (file.size > 15 * 1024 * 1024) { alert('حجم الصورة كبير (الحد الأقصى 15MB)'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview('')
    setExistingImageUrl(null)
  }

  const uploadQuestionImage = async (file: File) => {
    const compressed = await compressImage(file)
    const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `questions/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, compressed, {
      contentType: compressed.type || undefined,
      cacheControl: '31536000',
    })
    if (error) throw error
    return supabase.storage.from('images').getPublicUrl(path).data.publicUrl
  }

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
    setSaving(true)
    try {
      const original = editingId ? questions.find(q => q.id === editingId)?.image_url ?? null : null
      let image_url: string | null = existingImageUrl

      if (imageFile) {
        image_url = await uploadQuestionImage(imageFile)
      }

      const payload = { ...formData, image_url }

      if (editingId) {
        const { error } = await supabase.from('questions').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('questions').insert({
          ...payload,
          exam_id: examId,
          order_index: questions.length
        })
        if (error) throw error
      }

      // clean up the old file if it was replaced or removed
      if (original && original !== image_url) {
        const oldPath = storagePathFromUrl(original)
        if (oldPath) await supabase.storage.from('images').remove([oldPath])
      }

      setShowModal(false)
      setFormData(emptyForm)
      setEditingId(null)
      resetImageState()
      fetchData()
    } catch (error: any) {
      console.error(error)
      alert('حدث خطأ: ' + (error?.message || 'غير معروف'))
    } finally {
      setSaving(false)
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
    setImageFile(null)
    setImagePreview('')
    setExistingImageUrl(q.image_url || null)
    setEditingId(q.id)
    setShowModal(true)
  }

  const handleDelete = async (q: Question) => {
    if (!confirm('هل أنت متأكد من حذف هذا السؤال؟')) return
    try {
      const { error } = await supabase.from('questions').delete().eq('id', q.id)
      if (error) throw error
      const path = storagePathFromUrl(q.image_url)
      if (path) await supabase.storage.from('images').remove([path])
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
                <ArrowRight className="w-5 h-5" />
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
              <button onClick={() => { setShowModal(true); setFormData(emptyForm); setEditingId(null); resetImageState() }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
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
                    <button onClick={() => handleDelete(q)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p dir="auto" className="text-slate-900 font-medium mb-4 text-start whitespace-pre-line">{q.question_text}</p>
                {q.image_url && (
                  <img src={q.image_url} alt="" loading="lazy" className="mb-4 max-h-48 rounded-xl border border-slate-200" />
                )}
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
                <label className="block text-sm font-medium text-slate-700 mb-2">صورة السؤال (اختياري)</label>
                {(imagePreview || existingImageUrl) ? (
                  <div className="relative inline-block">
                    <img src={imagePreview || existingImageUrl || ''} alt="" className="max-h-52 rounded-xl border-2 border-slate-200" />
                    <button type="button" onClick={removeImage} className="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg" aria-label="حذف الصورة">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50/40 cursor-pointer transition-colors">
                    <ImagePlus className="w-7 h-7" />
                    <span className="text-sm">اضغط لاختيار صورة</span>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                )}
                {(imagePreview || existingImageUrl) && (
                  <label className="inline-block mt-2 text-sm text-emerald-700 cursor-pointer hover:underline">
                    تغيير الصورة
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                )}
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
                <button type="submit" disabled={saving} className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-xl disabled:opacity-60">{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                <button type="button" disabled={saving} onClick={() => setShowModal(false)} className="flex-1 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
