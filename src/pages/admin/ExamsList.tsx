import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, Menu, X, Home, LogOut, UserCog } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Course {
  id: string
  name: string
  image_url: string | null
}

export default function AdminExamsList() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
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
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('name')
      if (error) throw error
      setCourses(data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
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
            <h1 className="text-lg font-bold text-slate-900">الامتحانات</h1>
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-slate-100 rounded-lg">
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">اختار مادة يا حبيبي</h2>
          </div>

          <div className="flex justify-end mb-6">
            <button onClick={() => navigate('/admin/courses')} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
              <Folder className="w-4 h-4" />
              إدارة المواد
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">جاري التحميل...</div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl">
              <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">لا توجد مواد بعد</p>
              <button onClick={() => navigate('/admin/courses')} className="px-6 py-2 bg-emerald-600 text-white rounded-xl">
                إضافة مادة أولاً
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => navigate(`/admin/courses/${course.id}/exams`)}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-md hover:border-emerald-200 transition-all text-right"
                >
                  {course.image_url ? (
                    <img src={course.image_url} alt={course.name} className="w-full h-32 object-cover" />
                  ) : (
                    <div className="w-full h-32 bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                      <Folder className="w-8 h-8 text-emerald-700" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-slate-900">{course.name}</h3>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
