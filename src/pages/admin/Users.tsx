import { useState } from 'react'
import { Plus, Shield, Trash2, UserCog } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLive } from '../../lib/live'
import AdminLayout from '../../components/admin/AdminLayout'
import Modal from '../../components/admin/Modal'
import { confirmDialog, toast } from '../../components/admin/feedback'

interface AdminUser { id: string; name: string; phone: string; role: string }

export default function AdminUsers() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'admin' })
  const [saving, setSaving] = useState(false)

  const { data, loading, connected, reload } = useLive<AdminUser[]>(
    async () => {
      const { data, error } = await supabase.from('admins').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as AdminUser[]
    },
    ['admins']
  )
  const users = data || []

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim() || !form.password) return toast('املا كل الخانات', 'error')
    setSaving(true)
    try {
      const { error } = await supabase.from('admins').insert({ name: form.name.trim(), phone: form.phone.trim(), password: form.password, role: form.role })
      if (error) throw error
      toast('الأدمن اتضاف ✅')
      setOpen(false)
      setForm({ name: '', phone: '', password: '', role: 'admin' })
      reload()
    } catch (err: any) {
      toast(err?.message || 'حصلت مشكلة', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (u: AdminUser) => {
    const ok = await confirmDialog({ title: `تمسح الأدمن "${u.name}"؟`, confirmText: 'امسح', danger: true })
    if (!ok) return
    const { error } = await supabase.from('admins').delete().eq('id', u.id)
    if (error) return toast(error.message, 'error')
    toast('الأدمن اتمسح')
    reload()
  }

  const input = 'w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none'

  return (
    <AdminLayout
      title="المستخدمين"
     
      live={connected}
      actions={
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium shadow-lg shadow-emerald-600/20">
          <Plus className="w-4 h-4" />
          ضيف أدمن
        </button>
      }
    >
      {loading ? (
        <div className="h-40 rounded-3xl bg-slate-200/60 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${u.role === 'super_admin' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {u.role === 'super_admin' ? <Shield className="w-6 h-6" /> : <UserCog className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 truncate">{u.name}</div>
                <div className="text-sm text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>{u.phone}</div>
                <div className="text-xs mt-1 text-slate-400">{u.role === 'super_admin' ? 'سوبر أدمن' : 'أدمن'}</div>
              </div>
              {u.role !== 'super_admin' && (
                <button onClick={() => remove(u)} className="p-2 rounded-lg text-red-600 hover:bg-red-50" aria-label="مسح"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal
          title="ضيف أدمن جديد"
          onClose={() => !saving && setOpen(false)}
          maxWidth="max-w-md"
          footer={
            <div className="flex gap-2">
              <button form="user-form" type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-60">{saving ? 'بيتحفظ...' : 'حفظ'}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700">إلغاء</button>
            </div>
          }
        >
          <form id="user-form" onSubmit={save} className="space-y-4">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">الاسم *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} autoFocus /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">رقم التليفون *</label><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">كلمة المرور *</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} /></div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">الصلاحية</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>
                <option value="admin">أدمن</option>
                <option value="super_admin">سوبر أدمن</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  )
}
