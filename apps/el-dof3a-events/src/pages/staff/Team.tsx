import { useState } from 'react'
import { KeyRound, Plus, Shield, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import StaffLayout from '../../components/StaffLayout'
import { confirmDialog, toast } from '../../components/feedback'
import { Badge, btnPrimary, card, FullLoader, lightInputCls, Spinner } from '../../components/ui'
import type { Role } from '../../lib/api'
import { useLive } from '../../lib/live'
import { ROLE_AR } from '../../lib/staff'
import { normalizePhone } from './Login'
import { supabase } from '../../lib/supabase'

interface Member { user_id: string; username: string | null; name: string; role: Role }
const ROLE_HELP: Record<Role, string> = { super_admin: 'كل الصلاحيات', reviewer: 'الحجوزات فقط', scanner: 'السكانر فقط' }

async function api(method: string, body: unknown) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/el-dof3a-events-api/staff', {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'فشل الطلب')
  return j
}

export default function Team() {
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; m: Member } | null>(null)
  const [f, setF] = useState({ username: '', name: '', role: 'scanner' as Role, password: '' })
  const [busy, setBusy] = useState(false)
  const { data, loading, reload } = useLive(async () => {
    const { data, error } = await supabase.from('staff').select('*').order('created_at')
    if (error) throw error
    return (data || []) as Member[]
  }, [], 20000)

  const open = (m: typeof modal) => {
    setModal(m)
    setF(m && m.mode === 'edit' ? { username: m.m.username || '', name: m.m.name, role: m.m.role, password: '' } : { username: '', name: '', role: 'scanner', password: '' })
  }

  const save = async () => {
    if (!modal) return
    setBusy(true)
    try {
      if (modal.mode === 'add') {
        const phone = normalizePhone(f.username)
        if (!/^01\d{9}$/.test(phone)) throw new Error('رقم التليفون لازم يكون 11 رقم يبدأ بـ 01')
        if (!f.name.trim() || f.password.length < 6) throw new Error('املا كل الخانات (كلمة المرور 6 أحرف على الأقل)')
        await api('POST', { username: phone, name: f.name.trim(), role: f.role, password: f.password })
      } else {
        if (f.password && f.password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل')
        await api('PATCH', { user_id: modal.m.user_id, name: f.name.trim(), role: f.role, ...(f.password ? { password: f.password } : {}) })
      }
      toast('اتحفظ ✅'); setModal(null); void reload()
    } catch (e: any) { toast(e?.message || 'حصلت مشكلة', 'error') } finally { setBusy(false) }
  }

  const remove = async (m: Member) => {
    if (!(await confirmDialog({ title: `تمسح ${m.name}؟`, confirmText: 'امسح', danger: true }))) return
    try { await api('DELETE', { user_id: m.user_id }); void reload() } catch (e: any) { toast(e?.message || 'فشل', 'error') }
  }

  return (
    <StaffLayout title="الفريق" roles={['super_admin']} actions={<button className={btnPrimary} onClick={() => open({ mode: 'add' })}><Plus className="w-4 h-4" /> إضافة حد جديد</button>}>
      {loading ? <FullLoader /> : (
        <div className="space-y-2">
          {(data || []).map((m) => (
            <div key={m.user_id} className={`${card} p-4 flex items-center gap-3`}>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">{m.role === 'super_admin' ? <Shield className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}</div>
              <div className="flex-1 min-w-0"><div className="font-bold truncate">{m.name}</div><div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>{m.username}</div></div>
              <Badge tone={m.role === 'super_admin' ? 'amber' : m.role === 'reviewer' ? 'sky' : 'green'}>{ROLE_AR[m.role]}</Badge>
              <button className="px-3 py-1.5 text-sm rounded-xl bg-ink/10 hover:bg-ink/20" onClick={() => open({ mode: 'edit', m })}>تعديل</button>
              <button className="p-2 text-muted hover:text-red-600 dark:text-red-300" onClick={() => remove(m)}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'add' ? 'إضافة حد جديد' : 'تعديل'} maxWidth="max-w-md" onClose={() => setModal(null)}
          footer={<button className={`${btnPrimary} w-full`} disabled={busy} onClick={save}>{busy ? <Spinner /> : 'حفظ'}</button>}>
          <div className="light-modal space-y-3 text-ink">
            {modal.mode === 'add' && <input className={lightInputCls} dir="ltr" type="tel" inputMode="tel" placeholder="رقم التليفون (01xxxxxxxxx)" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />}
            <input className={lightInputCls} placeholder="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select className={lightInputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {(Object.keys(ROLE_AR) as Role[]).map((r) => <option key={r} value={r}>{ROLE_AR[r]} — {ROLE_HELP[r]}</option>)}
            </select>
            <input className={lightInputCls} dir="ltr" type="password" autoComplete="new-password" placeholder={modal.mode === 'add' ? 'الباسورد' : 'باسورد جديد (اختياري)'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
        </Modal>
      )}
    </StaffLayout>
  )
}
