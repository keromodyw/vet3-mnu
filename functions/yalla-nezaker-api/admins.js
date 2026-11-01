// Admin account management for Yalla Nezaker (Cloudflare Pages Function).
// Secrets (Cloudflare → Pages → Settings → Variables and Secrets):
//   SUPABASE_URL                 https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    (secret!)  — never put this in frontend code
// Only a signed-in super_admin (a row in public.admins) can call it.

const DOMAIN = 'yalla.vet3-mnu.pages.dev' // keep in sync with src/lib/adminAuth.ts
const FALLBACK_URL = 'https://qakqhqzoarzfdnrhwliy.supabase.co' // public project URL, same as the frontend
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } })
const pick = (env, names) => { for (const n of names) { const v = env?.[n]; if (v) return String(v).trim() } return '' }
const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('20') && d.length === 12 ? `0${d.slice(2)}` : d }

export async function onRequest({ request, env }) {
  // accept the common alternative names too, so an existing secret still works
  const base = (pick(env, ['SUPABASE_URL', 'SUPABASE_PROJECT_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) || FALLBACK_URL).replace(/\/+$/, '')
  const key = pick(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_ADMIN_KEY'])
  if (!key) return json({ error: 'السيرفر مش متظبط: ضيف SUPABASE_SERVICE_ROLE_KEY في Cloudflare → Settings → Variables and Secrets (Production + Preview) وبعدين اعمل Deploy جديد' }, 500)
  if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'method' }, 405)

  const svc = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'غير مسجل دخول' }, 401)

  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } })
  if (!who.ok) return json({ error: 'الجلسة منتهية' }, 401)
  const me = await who.json()

  const mine = await fetch(`${base}/rest/v1/admins?user_id=eq.${me.id}&select=role`, { headers: svc }).then((r) => r.json()).catch(() => [])
  if (!Array.isArray(mine) || mine[0]?.role !== 'super_admin') return json({ error: 'للسوبر أدمن فقط' }, 403)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad body' }, 400) }

  if (request.method === 'POST') {
    const phone = normPhone(body.phone)
    const { name, password } = body
    const role = body.role === 'super_admin' ? 'super_admin' : 'admin'
    if (!name || !/^01\d{9}$/.test(phone) || !password || String(password).length < 8) return json({ error: 'بيانات ناقصة أو كلمة المرور أقل من 8 حروف' }, 400)
    const created = await fetch(`${base}/auth/v1/admin/users`, { method: 'POST', headers: svc, body: JSON.stringify({ email: `${phone}@${DOMAIN}`, password, email_confirm: true }) })
    const cj = await created.json()
    if (!created.ok) return json({ error: created.status === 401 || created.status === 403 ? 'مفتاح الخدمة غلط أو منتهي — راجع SUPABASE_SERVICE_ROLE_KEY في Cloudflare' : cj.msg || cj.message || 'رقم التليفون ده مسجل قبل كده' }, created.status === 401 || created.status === 403 ? 500 : 400)
    // an old (pre-security) row for the same phone is replaced
    await fetch(`${base}/rest/v1/admins?phone=eq.${phone}&user_id=is.null`, { method: 'DELETE', headers: svc })
    const ins = await fetch(`${base}/rest/v1/admins`, { method: 'POST', headers: { ...svc, prefer: 'return=minimal' }, body: JSON.stringify({ user_id: cj.id, name, phone, role }) })
    if (!ins.ok) {
      await fetch(`${base}/auth/v1/admin/users/${cj.id}`, { method: 'DELETE', headers: svc }) // roll back
      return json({ error: 'فشل حفظ الأدمن' }, 500)
    }
    return json({ ok: true })
  }

  // DELETE
  const { id } = body
  if (!id) return json({ error: 'id' }, 400)
  const row = await fetch(`${base}/rest/v1/admins?id=eq.${id}&select=user_id`, { headers: svc }).then((r) => r.json()).catch(() => [])
  if (!Array.isArray(row) || !row[0]) return json({ error: 'مش موجود' }, 404)
  if (row[0].user_id === me.id) return json({ error: 'مينفعش تمسح نفسك' }, 400)
  const ok = row[0].user_id
    ? await fetch(`${base}/auth/v1/admin/users/${row[0].user_id}`, { method: 'DELETE', headers: svc }) // cascades to the admins row
    : await fetch(`${base}/rest/v1/admins?id=eq.${id}`, { method: 'DELETE', headers: svc })
  return ok.ok ? json({ ok: true }) : json({ error: 'فشل المسح' }, 500)
}
