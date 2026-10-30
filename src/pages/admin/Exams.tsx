import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit, FileText, Menu, X, Home, LogOut, UserCog, Calendar, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Exam {
  id: string
  name: string
  subject: string | null
  description: string | null
  course_id: string | null
  image_url: string | null
  publish_at: string | null
  created_at: string
}

export default function AdminExams() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [exams, setExams] = useState<Exam[]>([])
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', publish_now: 'now', publish_date: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [adminUser, setAdminUser] = useState<any>(null)

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth')
    if (auth !== 'true') {
      navigate('/admin/login')
      return
    }
    const user = localStorage.getItem('admin_user')
    if (user) setAdminUser(JSON.parse(user))
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [{ data: course }, { data: examsData }] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('exams').select('*').eq('course_id', courseId).order('created_at', { ascending: false })
      ])
      if (course) setCourseName(course.name)
      setExams(examsData || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let publish_at = null
      if (formData.publish_now === 'schedule' && formData.publish_date) {
        publish_at = new Date(formData.publish_date).toISOString()
      }

      if (editingId) {
        const { error } = await supabase
          .from('exams')
          .update({ 
            name: formData.name, 
            description: formData.description || null,
            publish_at 
          })
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('exams')
          .insert({ 
            name: formData.name, 
            description: formData.description || null,
            course_id: courseId,
            publish_at 
          })
        if (error) throw error
      }
      setShowModal(false)
      setFormData({ name: '', description: '', publish_now: 'now', publish_date: '' })
      setEditingId(null)
      fetchData()
    } catch (error) {
      alert('حدث خطأ')
    }
  }

  const handleEdit = (exam: Exam) => {
    setFormData({ 
      name: exam.name, 
      description: exam.description || '',
      publish_now: exam.publish_at ? 'schedule' : 'now',
      publish_date: exam.publish_at ? new Date(exam.publish_at).toISOString().slice(0, 16) : ''
    })
    setEditingId(exam.id)
    setShowModal(true)
  }

  const handleDelete = async (exam: Exam) => {
    if (!confirm('هل أنت متأكد من حذف هذا الامتحان؟ سيتم حذف جميع الأسئلة والصور المرتبطة به')) return
    try {
      if (exam.image_url) {
        const path = exam.image_url.split('/images/')[1]
        if (path) await supabase.storage.from('images').remove([path])
      }
      const { error } = await supabase.from('exams').delete().eq('id', exam.id)
      if (error) throw error
      fetchData()
    } catch (error) {
      alert('حدث خطأ')
    }
  }

  const logout = () => {
    localStorage.removeItem('admin_auth')
    localStorage.removeItem('admin_user')
    navigate('/admin/login')
  }

  const menuItems = [
    { icon: Home, label: 'الرئيسية', path: '/admin' },
    { icon: FileText, label: 'الامتحانات', path: '/admin/exams' },
    ...(adminUser?.role === 'super_admin' ? [{ icon: UserCog, label: 'إدارة المستخدمين', path: '/admin/users' }] : [])
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className={`fixed inset-y-0 right-0 z-50 w-64 bg-slate-900 transform ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="Logo" className="w-10 h-10 rounded-full" />
            <span className="text-white font-bold">شاشة الأدمن</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                item.path === '/admin/exams' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="absolute bottom-4 right-4 left-4">
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="w-5 h-5" />
            <span>خروج</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:mr-64">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">امتحانات {courseName}</h1>
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-slate-100 rounded-lg">
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" />
              <span>العودة للمواد</span>
            </button>
            <button onClick={() => { setShowModal(true); setFormData({ name: '', description: '', publish_now: 'now', publish_date: '' }); setEditingId(null) }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
              <Plus className="w-4 h-4" />
              إضافة امتحان
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">جاري التحميل...</div>
          ) : exams.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">لا توجد امتحانات بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {exams.map((exam) => (
                <div key={exam.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-emerald-700" />
                    </div>
                    {exam.publish_at && (
                      <span className="px-2 py-1 rounded-full bg-orange-50 text-orange-700 text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        مجدول
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{exam.name}</h3>
                  {exam.description && <p className="text-sm text-slate-600 mb-3">{exam.description}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigate(`/admin/exams/${exam.id}/questions`)} className="flex-1 py-2 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                      إدارة الأسئلة
                    </button>
                    <button onClick={() => navigate(`/admin/import?examId=${exam.id}`)} className="px-3 py-2 rounded-lg bg-teal-50 text-teal-700 text-xs font-medium flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" />
                      Excel
                    </button>
                    <button onClick={() => handleEdit(exam)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(exam)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md my-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">{editingId ? 'تعديل امتحان' : 'إضافة امتحان'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">اسم الامتحان *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">وصف الامتحان (اختياري)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">وقت الظهور</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="now"
                      checked={formData.publish_now === 'now'}
                      onChange={(e) => setFormData({ ...formData, publish_now: e.target.value })}
                    />
                    <span>حالاً</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="schedule"
                      checked={formData.publish_now === 'schedule'}
                      onChange={(e) => setFormData({ ...formData, publish_now: e.target.value })}
                    />
                    <span>وقت تاني</span>
                  </label>
                  {formData.publish_now === 'schedule' && (
                    <input
                      type="datetime-local"
                      value={formData.publish_date}
                      onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                    />
                  )}
                </div>
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
