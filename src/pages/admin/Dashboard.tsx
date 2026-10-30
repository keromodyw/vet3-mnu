import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, FileText, LogOut, Home, Menu, X, Folder, UserCog } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ visitors: 0, submissions: 0 })
  const [examStats, setExamStats] = useState<any[]>([])
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
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const [visitorsRes, examsRes, questionsRes] = await Promise.all([
        supabase.from('visitors').select('id', { count: 'exact', head: true }),
        supabase.from('exams').select('*'),
        supabase.from('questions').select('exam_id')
      ])
      
      // Count submissions per exam (approximate - count questions attempted)
      const submissions = questionsRes.data?.length || 0
      
      setStats({
        visitors: visitorsRes.count || 0,
        submissions: submissions
      })
      
      const exams = examsRes.data || []
      const examData = await Promise.all(exams.map(async (exam) => {
        const { count } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('exam_id', exam.id)
        return { ...exam, submissions: count || 0 }
      }))
      setExamStats(examData)
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
            <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Logo" className="w-10 h-10 rounded-full" />
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

      {/* Main Content */}
      <div className="flex-1 lg:mr-64">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">شاشة الأدمن</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-100 rounded-lg">
                <Home className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">الإحصائيات</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-600">عدد الزوار</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{loading ? '...' : stats.visitors}</div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-600">إجمالي عدد الحلول</span>
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{loading ? '...' : stats.submissions}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">إحصائيات الامتحانات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-right p-4 text-sm font-semibold text-slate-700">اسم الامتحان</th>
                    <th className="text-right p-4 text-sm font-semibold text-slate-700">المادة</th>
                    <th className="text-center p-4 text-sm font-semibold text-slate-700">عدد الحلول</th>
                  </tr>
                </thead>
                <tbody>
                  {examStats.map((exam) => (
                    <tr key={exam.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-4 text-slate-900">{exam.name}</td>
                      <td className="p-4 text-slate-600">{exam.subject || '-'}</td>
                      <td className="p-4 text-center text-slate-900 font-medium">{exam.submissions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
