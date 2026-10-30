import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, Trash2, Edit, Folder, Upload, Menu, X, Home, LogOut, UserCog } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Course {
  id: string
  name: string
  image_url: string | null
  created_at: string
}

export default function AdminCourses() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [adminUser, setAdminUser] = useState<any>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth')
    if (auth !== 'true') {
      navigate('/admin/login')
      return
    }
    const user = localStorage.getItem('admin_user')
    if (user) setAdminUser(JSON.parse(user))
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setCourses(data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadImage = async (file: File) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `courses/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('images').getPublicUrl(filePath)
    return data.publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploading(true)
    try {
      let imageUrl = null
      if (imageFile) {
        imageUrl = await uploadImage(imageFile)
      }

      if (editingId) {
        const updateData: any = { name: formData.name }
        if (imageUrl) updateData.image_url = imageUrl
        const { error } = await supabase
          .from('courses')
          .update(updateData)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('courses')
          .insert({ name: formData.name, image_url: imageUrl })
        if (error) throw error
      }
      setShowModal(false)
      setFormData({ name: '' })
      setEditingId(null)
      setImageFile(null)
      setImagePreview('')
      fetchCourses()
    } catch (error) {
      alert('حدث خطأ')
    } finally {
      setUploading(false)
    }
  }

  const handleEdit = (course: Course) => {
    setFormData({ name: course.name })
    setEditingId(course.id)
    setImagePreview(course.image_url || '')
    setShowModal(true)
  }

  const handleDelete = async (course: Course) => {
    if (!confirm('هل أنت متأكد من حذف هذه المادة؟ سيتم حذف جميع الامتحانات والصور المرتبطة بها')) return
    try {
      if (course.image_url) {
        const path = course.image_url.split('/images/')[1]
        if (path) {
          await supabase.storage.from('images').remove([path])
        }
      }
      const { error } = await supabase.from('courses').delete().eq('id', course.id)
      if (error) throw error
      fetchCourses()
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
    { icon: Folder, label: 'الامتحانات', path: '/admin/exams' },
    ...(adminUser?.role === 'super_admin' ? [{ icon: UserCog, label: 'إدارة المستخدمين', path: '/admin/users' }] : [])
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
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
                location.pathname === item.path ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
            <h1 className="text-lg font-bold text-slate-900">المواد الدراسية</h1>
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-slate-100 rounded-lg">
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => navigate('/admin/exams')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
              <ArrowRight className="w-4 h-4" />
              <span>العودة</span>
            </button>
            <button onClick={() => { setShowModal(true); setFormData({ name: '' }); setEditingId(null); setImageFile(null); setImagePreview('') }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
              <Plus className="w-4 h-4" />
              إضافة مادة
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">جاري التحميل...</div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl">
              <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">لا توجد مواد بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <div key={course.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                  {course.image_url ? (
                    <img src={course.image_url} alt={course.name} className="w-full h-32 object-cover" />
                  ) : (
                    <div className="w-full h-32 bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                      <Folder className="w-8 h-8 text-emerald-700" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-slate-900 mb-3">{course.name}</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/admin/courses/${course.id}/exams`)} className="flex-1 py-2 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                        عرض الامتحانات
                      </button>
                      <button onClick={() => handleEdit(course)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(course)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-900 mb-4">{editingId ? 'تعديل مادة' : 'إضافة مادة'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">اسم المادة *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">صورة المادة</label>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  )}
                  <label className="cursor-pointer text-emerald-600 text-sm font-medium">
                    اختر صورة
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={uploading} className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-xl disabled:opacity-50">
                  {uploading ? 'جاري الحفظ...' : 'حفظ'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
