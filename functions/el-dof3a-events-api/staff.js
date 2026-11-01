// Staff account management for El Dof3a Events (Cloudflare Pages Function).
// Needs two secrets in Cloudflare → Pages → Settings → Variables:
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    (secret!) never put this in the frontend
// Only a signed-in super_admin can call it.

const DOMAIN = 'staff.vet3-mnu.pages.dev' // keep in sync with pages/staff/Login.tsx
const ROLES = ['super_admin', 'reviewer', 'scanner']
const FALLBACK_URL = 'https://qakqhqzoarzfdnrhwliy.supabase.co' // public project URL, same as the frontend
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } })
const pick = (env, names) => { for (const n of names) { const v = env?.[n]; if (v) return String(v).trim() } return '' }

export async function onRequest({ request, env }) {
  // accept the common alternative names too, so an existing secret still works
  const base = (pick(env, ['SUPABASE_URL', 'SUPABASE_PROJECT_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) || FALLBACK_URL).replace(/\/+$/, '')
  const key = pick(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_ADMIN_KEY'])
  if (!key) return json({ error: 'السيرفر مش متظبط: ضيف SUPABASE_SERVICE_ROLE_KEY في Cloudflare → Settings → Variables and Secrets (Production + Preview) وبعدين اعمل Deploy جديد' }, 500)
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'method' }, 405)

  // all El Dof3a Events tables live in the el_dof3a_events schema
  const svc = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', 'accept-profile': 'el_dof3a_events', 'content-profile': 'el_dof3a_events' }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'غير مسجل دخول' }, 401)

  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } })
  if (!who.ok) return json({ error: 'الجلسة منتهية' }, 401)
  const me = await who.json()

  const role = await fetch(`${base}/rest/v1/staff?user_id=eq.${me.id}&select=role`, { headers: svc }).then((r) => r.json()).catch(() => [])
  if (!Array.isArray(role) || role[0]?.role !== 'super_admin') return json({ error: 'للسوبر أدمن فقط' }, 403)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad body' }, 400) }

  if (request.method === 'POST') {
    const { username, name, role: r, password } = body
    if (!username || !name || !ROLES.includes(r) || !password || String(password).length < 6) return json({ error: 'بيانات ناقصة' }, 400)
    const email = String(username).includes('@') ? String(username).trim() : `${String(username).trim().toLowerCase()}@${DOMAIN}`
    const created = await fetch(`${base}/auth/v1/admin/users`, { method: 'POST', headers: svc, body: JSON.stringify({ email, password, email_confirm: true }) })
    const cj = await created.json()
    if (!created.ok) return json({ error: created.status === 401 || created.status === 403 ? 'مفتاح الخدمة غلط أو منتهي — راجع SUPABASE_SERVICE_ROLE_KEY في Cloudflare' : cj.msg || cj.message || 'اسم المستخدم مستخدم قبل كده' }, created.status === 401 || created.status === 403 ? 500 : 400)
    const ins = await fetch(`${base}/rest/v1/staff`, { method: 'POST', headers: { ...svc, prefer: 'return=minimal' }, body: JSON.stringify({ user_id: cj.id, username: String(username).trim(), name, role: r }) })
    if (!ins.ok) {
      await fetch(`${base}/auth/v1/admin/users/${cj.id}`, { method: 'DELETE', headers: svc }) // roll back
      return json({ error: 'فشل حفظ العضو' }, 500)
    }
    return json({ ok: true, user_id: cj.id })
  }

  const { user_id } = body
  if (!user_id) return json({ error: 'user_id' }, 400)

  if (request.method === 'PATCH') {
    if (user_id === me.id && body.role && body.role !== 'super_admin') return json({ error: 'مينفعش تنزّل صلاحيتك بنفسك' }, 400)
    if (body.password) {
      const p = await fetch(`${base}/auth/v1/admin/users/${user_id}`, { method: 'PUT', headers: svc, body: JSON.stringify({ password: body.password }) })
      if (!p.ok) return json({ error: 'فشل تغيير كلمة المرور' }, 400)
    }
    const patch = {}
    if (body.name) patch.name = body.name
    if (body.role && ROLES.includes(body.role)) patch.role = body.role
    if (Object.keys(patch).length) {
      const u = await fetch(`${base}/rest/v1/staff?user_id=eq.${user_id}`, { method: 'PATCH', headers: { ...svc, prefer: 'return=minimal' }, body: JSON.stringify(patch) })
      if (!u.ok) return json({ error: 'فشل التعديل' }, 500)
    }
    return json({ ok: true })
  }

  // DELETE
  if (user_id === me.id) return json({ error: 'مينفعش تمسح نفسك' }, 400)
  const d = await fetch(`${base}/auth/v1/admin/users/${user_id}`, { method: 'DELETE', headers: svc })
  return d.ok ? json({ ok: true }) : json({ error: 'فشل المسح' }, 500)
}
