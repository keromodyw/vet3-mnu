import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Phone } from 'lucide-react'
import { Brand, btnPrimary, card, inputCls, Spinner, ThemeToggle } from '../../components/ui'
import { fetchRole } from '../../lib/staff'
import { supabase } from '../../lib/supabase'

export const STAFF_DOMAIN = 'staff.vet3-mnu.pages.dev' // keep in sync with functions/el-dof3a-events-api/staff.js
export const normalizePhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.startsWith('20') && d.length === 12 ? `0${d.slice(2)}` : d }
/** staff log in with phone + password; the phone is the account's email local-part */
export const toEmail = (u: string) => (u.includes('@') ? u.trim() : `${normalizePhone(u)}@${STAFF_DOMAIN}`)

export default function StaffLogin() {
  const navigate = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(user), password: pass })
    if (error) {
      setBusy(false)
      return setErr(/confirm/i.test(error.message) ? 'الحساب لسه ما اتأكدش — فعّل Auto Confirm للمستخدم في Supabase' : 'رقم التليفون أو كلمة المرور غير صحيحة')
    }
    // only go in if the account really is staff; otherwise say WHY instead of bouncing back here
    const r = await fetchRole()
    setBusy(false)
    if (!r.staff) return setErr(r.error || 'حصلت مشكلة')
    navigate('/staff', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-4 left-4"><ThemeToggle /></div>
      <form onSubmit={login} className={`${card} w-full max-w-sm p-7 space-y-4`}>
        <div className="flex justify-center"><Brand /></div>
        <h1 className="text-center font-extrabold text-lg">دخول المنظمين</h1>
        <div className="relative"><Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input className={`${inputCls} pr-11`} dir="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="رقم التليفون" value={user} onChange={(e) => setUser(e.target.value)} required /></div>
        <div className="relative"><Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input className={`${inputCls} pr-11`} dir="ltr" type="password" autoComplete="current-password" placeholder="الباسورد" value={pass} onChange={(e) => setPass(e.target.value)} required /></div>
        {err && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm leading-relaxed">{err}</div>}
        <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? <Spinner /> : 'دخول'}</button>
        <button type="button" className="w-full text-sm text-muted hover:text-ink" onClick={() => navigate('/')}>الرجوع للموقع</button>
      </form>
    </div>
  )
}
