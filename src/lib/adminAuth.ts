import { supabase } from './supabase'

// Admins are real Supabase Auth users (phone is turned into a login email).
// Nothing secret lives in the browser any more; permissions are enforced by the database (see supabase/yalla-security.sql).
export const ADMIN_EMAIL_DOMAIN = 'yalla.vet3-mnu.pages.dev' // keep in sync with functions/yalla-nezaker-api/admins.js

export function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.startsWith('20') && d.length === 12 ? `0${d.slice(2)}` : d
}
export const phoneToEmail = (phone: string) => `${normalizePhone(phone)}@${ADMIN_EMAIL_DOMAIN}`

export interface AdminInfo { name: string; phone: string; role: string }

/** returns the signed-in admin, or null (no session / not an admin) */
export async function getCurrentAdmin(): Promise<AdminInfo | null> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return null
  const { data: row } = await supabase.from('admins').select('name, phone, role').eq('user_id', uid).maybeSingle()
  return (row as AdminInfo | null) ?? null
}

export function cacheAdmin(a: AdminInfo | null) {
  try {
    if (a) { localStorage.setItem('admin_auth', 'true'); localStorage.setItem('admin_user', JSON.stringify(a)) }
    else { localStorage.removeItem('admin_auth'); localStorage.removeItem('admin_user') }
  } catch { /* storage blocked */ }
}

export async function adminLogout() {
  cacheAdmin(null)
  await supabase.auth.signOut()
}

/** create / delete admins through the Cloudflare Function (needs the service key, which never reaches the browser) */
export async function adminApi(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/yalla-nezaker-api/admins', {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'فشل الطلب')
  return j
}
