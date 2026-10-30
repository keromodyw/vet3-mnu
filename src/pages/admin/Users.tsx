import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, Trash2, Menu, X, Home, LogOut, UserCog } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface AdminUser {
  id: string
  name: string
  phone: string
  password: string
  role: string
  created_at: string
}

export default function AdminUsers() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', role: 'admin' })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth')
    if (auth !== 'true') {
      navigate('/admin/login')
      return
    }
    const user = localStorage.getItem('admin_user')
    if (user) {
      const parsed = JSON.parse(user)
      if (parsed.role !== 'super_admin') {
        navigate('/admin')
        return
      }
    }
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabase.from('admins').insert([formData])
      if (error) throw error
      setShowModal(false)
      setFormData({ name: '', phone: '', password: '', role: 'admin' })
      fetchUsers()
    } catch (error) {
      alert('حدث خطأ')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return
    try {
      const { error } = await supabase.from('admins').delete().eq('id', id)
      if (error) throw error
      fetchUsers()
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
    { icon: UserCog, label: 'الامتحانات', path: '/admin/exams' },
    { icon: UserCog, label: 'إدارة المستخدمين', path: '/admin/users' }
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
                item.path === '/admin/users' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
            <h1 className="text-lg font-bold text-slate-900">إدارة المستخدمين</h1>
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-slate-100 rounded-lg">
              <Home className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
              <ArrowRight className="w-4 h-4" />
              <span>العودة</span>
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
              <Plus className="w-4 h-4" />
              إضافة أدمن
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-right p-4 text-sm font-semibold text-slate-700">الاسم</th>
                    <th className="text-right p-4 text-sm font-semibold text-slate-700">رقم التليفون</th>
                    <th className="text-right p-4 text-sm font-semibold text-slate-700">الصلاحية</th>
                    <th className="text-center p-4 text-sm font-semibold text-slate-700">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0">
                      <td className="p-4 text-slate-900">{user.name}</td>
                      <td className="p-4 text-slate-600">{user.phone}</td>
                      <td className="p-4 text-slate-600">{user.role === 'super_admin' ? 'سوبر أدمن' : 'أدمن'}</td>
                      <td className="p-4 text-center">
                        {user.role !== 'super_admin' && (
                          <button onClick={() => handleDelete(user.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-900 mb-4">إضافة أدمن جديد</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">الاسم *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">رقم التليفون *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">كلمة المرور *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">الصلاحية</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="admin">أدمن</option>
                  <option value="editor">محرر</option>
                </select>
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
