import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Check super admin
      if (phone === '01551711514' && password === 'admin123') {
        localStorage.setItem('admin_auth', 'true')
        localStorage.setItem('admin_user', JSON.stringify({ phone, role: 'super_admin', name: 'Super Admin' }))
        navigate('/admin')
        setLoading(false)
        return
      }

      // Check other admins
      const { data, error: dbError } = await supabase
        .from('admins')
        .select('*')
        .eq('phone', phone)
        .eq('password', password)
        .single()

      if (dbError || !data) {
        setError('رقم التليفون أو كلمة المرور غير صحيحة')
        setLoading(false)
        return
      }

      localStorage.setItem('admin_auth', 'true')
      localStorage.setItem('admin_user', JSON.stringify({ ...data, role: data.role || 'admin' }))
      navigate('/admin')
    } catch (err) {
      setError('حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/95 backdrop-blur-sm mb-4 shadow-2xl p-2">
            <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Yalla Nezaker" className="w-full h-full object-contain rounded-full" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">شاشة الأدمن</h1>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">رقم التليفون</label>
              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="01XXXXXXXXX"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="أدخل كلمة المرور"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium disabled:opacity-50 hover:shadow-lg hover:shadow-emerald-600/30 transition-all"
            >
              {loading ? 'جاري الدخول...' : 'دخول'}
            </button>
          </form>
        </div>

        <button onClick={() => navigate('/')} className="w-full mt-4 py-2 text-slate-400 hover:text-white transition-colors">
          العودة للرئيسية
        </button>
      </div>
    </div>
  )
}
