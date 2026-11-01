import { useCallback, useEffect, useState } from 'react'
import { rpc, type Role } from './api'
import { supabase } from './supabase'

export interface StaffInfo { role: Role; name: string }

/** Turns a failed role lookup into a message that says exactly what to fix. */
export function roleProblem(err: unknown): string {
  const m = String((err as any)?.message || err || '')
  if (/schema/i.test(m) || /PGRST106/.test(m)) return 'الـ schema اسمه el_dof3a_events لسه مش متفعل: Supabase → Project Settings → API → Exposed schemas → ضيفه واحفظ.'
  if (/md_my_role|function|404/i.test(m)) return 'قاعدة البيانات لسه ما اتجهزتش: شغّل ملف el-dof3a-events.sql في SQL Editor.'
  return `تعذّر قراءة الصلاحيات: ${m || 'خطأ غير معروف'}`
}
export const NOT_STAFF = 'تم تسجيل الدخول لكن الحساب ده مش مضاف في جدول staff. شغّل أمر إضافة السوبر أدمن (موجود في README) بنفس الإيميل.'

/** Reads the role from the database (never trusted from the browser). */
export async function fetchRole(): Promise<{ staff: StaffInfo | null; error: string | null }> {
  try {
    const r = await rpc<StaffInfo | null>('md_my_role')
    return r ? { staff: r, error: null } : { staff: null, error: NOT_STAFF }
  } catch (e) {
    return { staff: null, error: roleProblem(e) }
  }
}

export function useStaff() {
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<StaffInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setHasSession(!!data.session)
    if (!data.session) { setStaff(null); setError(null); setLoading(false); return }
    const r = await fetchRole()
    setStaff(r.staff); setError(r.error); setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => {
      // never call supabase from inside this callback directly (can deadlock) → defer
      if (ev === 'SIGNED_OUT') setTimeout(() => { setStaff(null); setHasSession(false); setLoading(false) }, 0)
      if (ev === 'SIGNED_IN') setTimeout(() => void load(), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setStaff(null); setHasSession(false) }, [])
  return { loading, staff, error, hasSession, signOut }
}

export const ROLE_AR: Record<Role, string> = { super_admin: 'سوبر أدمن', reviewer: 'مراجع', scanner: 'سكانر' }
