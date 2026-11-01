import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Armchair, Eye, EyeOff, Pencil, Plus, Timer, Trash2 } from 'lucide-react'
import Modal from '../../components/Modal'
import StaffLayout from '../../components/StaffLayout'
import { confirmDialog, toast } from '../../components/feedback'
import { Badge, btnPrimary, card, FullLoader, lightInputCls, Spinner } from '../../components/ui'
import { errText, rpc, type EventRow } from '../../lib/api'
import { purgeProofFiles } from '../../lib/cleanup'
import { useLive } from '../../lib/live'
import { supabase } from '../../lib/supabase'
import { cairoLocalToISO, fmtCountdown, formatCairo, isoToCairoLocal, useNow } from '../../lib/time'

interface Form {
  title: string; description: string; venue: string; poster_url: string
  event_at: string; opens: string; closes: string
  price: string; instapay_phone: string; instapay_note: string; max: string; hold: string; published: boolean
  mode: 'seats' | 'names'; payment: boolean; autoApprove: boolean
}
const EMPTY: Form = { title: '', description: '', venue: '', poster_url: '', event_at: '', opens: '', closes: '', price: '0', instapay_phone: '', instapay_note: '', max: '', hold: '10', published: false, mode: 'seats', payment: true, autoApprove: false }
const toForm = (e: EventRow): Form => ({
  title: e.title, description: e.description || '', venue: e.venue || '', poster_url: e.poster_url || '',
  event_at: e.event_at ? isoToCairoLocal(e.event_at) : '', opens: e.booking_opens_at ? isoToCairoLocal(e.booking_opens_at) : '', closes: e.booking_closes_at ? isoToCairoLocal(e.booking_closes_at) : '',
  price: String(e.price), instapay_phone: e.instapay_phone || '', instapay_note: e.instapay_note || '',
  max: e.max_bookings === null ? '' : String(e.max_bookings), hold: String(e.hold_minutes), published: e.published,
  mode: e.booking_mode, payment: e.payment_required, autoApprove: e.auto_approve,
})

export default function Events() {
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null)
  const [saving, setSaving] = useState(false)

  const { data, loading, reload } = useLive(async () => {
    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as EventRow[]
  }, ['events'])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((s) => (s ? { ...s, form: { ...s.form, [k]: v } } : s))

  const save = async () => {
    if (!editing) return
    const f = editing.form
    if (!f.title.trim()) return toast('اكتب اسم الإيفينت', 'error')
    const payload = {
      title: f.title.trim(), description: f.description.trim() || null, venue: f.venue.trim() || null, poster_url: f.poster_url.trim() || null,
      event_at: f.event_at ? cairoLocalToISO(f.event_at) : null,
      booking_opens_at: f.opens ? cairoLocalToISO(f.opens) : null,
      booking_closes_at: f.closes ? cairoLocalToISO(f.closes) : null,
      price: f.payment ? Math.max(0, Number(f.price) || 0) : 0,
      booking_mode: f.mode, payment_required: f.payment, auto_approve: !f.payment && f.autoApprove,
      instapay_phone: f.instapay_phone.trim() || null, instapay_note: f.instapay_note.trim() || null,
      max_bookings: f.max.trim() === '' ? null : Math.max(0, Math.floor(Number(f.max) || 0)),
      hold_minutes: Math.min(120, Math.max(1, Math.floor(Number(f.hold) || 10))),
      published: f.published,
    }
    setSaving(true)
    const { error } = editing.id ? await supabase.from('events').update(payload).eq('id', editing.id) : await supabase.from('events').insert(payload)
    setSaving(false)
    if (error) return toast(errText(error), 'error')
    toast('اتحفظت الإيفينت ✅'); setEditing(null); void reload()
  }

  const togglePublish = async (e: EventRow) => {
    const { error } = await supabase.from('events').update({ published: !e.published }).eq('id', e.id)
    if (error) return toast(errText(error), 'error')
    void reload()
  }

  const remove = async (e: EventRow) => {
    const ok = await confirmDialog({ title: `تمسح "${e.title}"؟`, message: 'هتتمسح كل الكراسي والحجوزات وسجل السكان وصور الدفع الخاصة بالإيفينت ده نهائياً.', confirmText: 'امسح كل حاجة', danger: true })
    if (!ok) return
    try {
      const gone = await rpc<Array<{ id: string; proof_path: string | null }>>('md_reset_event', { p_event: e.id })   // bookings + scans, returns what to clean
      await purgeProofFiles(gone)
      const { error } = await supabase.from('events').delete().eq('id', e.id)
      if (error) throw error
      toast('اتمسح الإيفينت بكل بياناته'); void reload()
    } catch (err) { toast(errText(err), 'error') }
  }

  const f = editing?.form
  return (
    <StaffLayout title="الإيفينتات والكراسي" roles={['super_admin']}
      actions={<button className={btnPrimary} onClick={() => setEditing({ id: null, form: EMPTY })}><Plus className="w-4 h-4" /> إيفينت جديد</button>}>
      {loading ? <FullLoader /> : (data || []).length === 0 ? <div className={`${card} p-10 text-center text-muted`}>لسه ما فيش إيفينتات — ابدأ بإيفينت جديد.</div> : (
        <div className="space-y-3">
          {(data || []).map((e) => (
            <div key={e.id} className={`${card} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><h3 className="font-extrabold text-lg">{e.title}</h3>{e.published ? <Badge tone="green">الحجز مفتوح</Badge> : <Badge>الحجز مقفول</Badge>}</div>
                  <div className="text-sm text-muted mt-1 space-y-0.5">
                    <div>العرض: {formatCairo(e.event_at)}</div>
                    <div>الحجز: {e.booking_opens_at ? formatCairo(e.booking_opens_at) : 'فور فتح الحجز'} ← {e.booking_closes_at ? formatCairo(e.booking_closes_at) : 'مفتوح'}</div>
                    <OpensIn iso={e.booking_opens_at} />
                    <div>{e.booking_mode === 'seats' ? 'حجز بالكراسي' : 'تسجيل بالاسم'} · {e.payment_required ? `${e.price} جنيه` : e.auto_approve ? 'مجاني (اعتماد تلقائي)' : 'مجاني (بمراجعة)'} · الحد الأقصى: {e.max_bookings ?? (e.booking_mode === 'seats' ? 'كل الكراسي' : 'غير محدود')} · مهلة {e.hold_minutes} د</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.booking_mode === 'seats' && <Link to={`/staff/events/${e.id}/seats`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm"><Armchair className="w-4 h-4" /> الكراسي</Link>}
                  <button className="p-2.5 rounded-xl bg-ink/10 hover:bg-ink/20" title={e.published ? 'قفل الحجز' : 'فتح الحجز'} onClick={() => togglePublish(e)}>{e.published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  <button className="p-2.5 rounded-xl bg-ink/10 hover:bg-ink/20" onClick={() => setEditing({ id: e.id, form: toForm(e) })}><Pencil className="w-4 h-4" /></button>
                  <button className="p-2.5 rounded-xl bg-red-500/15 text-red-600 dark:text-red-300 hover:bg-red-500/30" onClick={() => remove(e)}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && f && (
        <Modal title={editing.id ? 'تعديل الإيفينت' : 'إيفينت جديد'} maxWidth="max-w-2xl" onClose={() => setEditing(null)}
          footer={<button className={`${btnPrimary} w-full`} disabled={saving} onClick={save}>{saving ? <Spinner /> : 'حفظ'}</button>}>
          <div className="light-modal space-y-3 text-ink">
            <Field label="اسم الإيفينت"><input className={lightInputCls} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <div>
              <span className="block text-sm font-semibold mb-1">نوع الحجز</span>
              <div className="grid grid-cols-2 gap-2">
                {([['seats', 'حجز بالكراسي', 'الطالب يختار كرسي من خريطة القاعة'], ['names', 'تسجيل بالاسم فقط', 'من غير كراسي — بيتسجل اسمه']] as const).map(([k, t, d]) => (
                  <button key={k} type="button" disabled={!!editing.id} onClick={() => set('mode', k)}
                    className={`text-right p-3 rounded-2xl border-2 transition disabled:cursor-not-allowed ${f.mode === k ? 'border-emerald-500 bg-emerald-500/10' : 'border-line hover:bg-ink/5'}`}>
                    <div className="font-bold text-sm">{t}</div><div className="text-[11px] text-muted mt-0.5">{d}</div>
                  </button>
                ))}
              </div>
              {editing.id && <p className="text-[11px] text-muted mt-1">نوع الحجز مينفعش يتغير بعد الإنشاء.</p>}
            </div>
            <Field label="وصف"><textarea className={lightInputCls} rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="المكان"><input className={lightInputCls} value={f.venue} onChange={(e) => set('venue', e.target.value)} /></Field>
              <Field label="رابط البوستر (اختياري)"><input className={lightInputCls} dir="ltr" value={f.poster_url} onChange={(e) => set('poster_url', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="موعد العرض"><input type="datetime-local" className={lightInputCls} value={f.event_at} onChange={(e) => set('event_at', e.target.value)} /></Field>
              <Field label="بداية الحجز"><input type="datetime-local" className={lightInputCls} value={f.opens} onChange={(e) => set('opens', e.target.value)} /><OpensIn iso={f.opens ? cairoLocalToISO(f.opens) : null} /></Field>
              <Field label="نهاية الحجز (اختياري)"><input type="datetime-local" className={lightInputCls} value={f.closes} onChange={(e) => set('closes', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={f.mode === 'names' ? 'السعة (عدد الأماكن)' : 'أقصى عدد حجوزات'}><input type="number" min={0} className={lightInputCls} placeholder={f.mode === 'names' ? 'غير محدود' : 'كل الكراسي'} value={f.max} onChange={(e) => set('max', e.target.value)} /></Field>
              <Field label="مهلة الكرسي (دقيقة)"><input type="number" min={1} max={120} className={lightInputCls} value={f.hold} onChange={(e) => set('hold', e.target.value)} /></Field>
            </div>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={f.payment} onChange={(e) => set('payment', e.target.checked)} /> الإيفينت بدفع (InstaPay + إثبات دفع)</label>
            {f.payment ? (
              <div className="space-y-3 p-3 rounded-2xl bg-ink/5">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="سعر التذكرة (جنيه)"><input type="number" min={0} className={lightInputCls} value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
                  <Field label="رقم InstaPay"><input className={lightInputCls} dir="ltr" value={f.instapay_phone} onChange={(e) => set('instapay_phone', e.target.value)} /></Field>
                </div>
                <Field label="ملاحظة للطالب عن الدفع"><textarea className={lightInputCls} rows={2} value={f.instapay_note} onChange={(e) => set('instapay_note', e.target.value)} /></Field>
              </div>
            ) : (
              <label className="flex items-start gap-2 p-3 rounded-2xl bg-ink/5 text-sm"><input type="checkbox" className="w-5 h-5 mt-0.5 accent-emerald-600" checked={f.autoApprove} onChange={(e) => set('autoApprove', e.target.checked)} />
                <span><b>اعتماد تلقائي</b><br /><span className="text-muted text-xs">الطالب ياخد تذكرته فوراً من غير ما تتراجع. لو مقفولة، الحجز بيروح للمراجعة زي الباقي.</span></span></label>
            )}
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={f.published} onChange={(e) => set('published', e.target.checked)} /> فتح الحجز للطلاب</label>
          </div>
        </Modal>
      )}
    </StaffLayout>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-sm font-semibold mb-1">{label}</span>{children}</label>
}

/** live countdown while the booking start is still in the future (server clock); renders nothing once it has begun */
function OpensIn({ iso }: { iso: string | null | undefined }) {
  const now = useNow()
  if (!iso) return null
  const left = new Date(iso).getTime() - now
  if (!(left > 0)) return null
  return (
    <span className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-bold">
      <Timer className="w-3.5 h-3.5" /> الحجز يفتح بعد <b className="tabular-nums" dir="ltr">{fmtCountdown(left)}</b>
    </span>
  )
}
