import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, Edit, Eye, FileSpreadsheet, FileText, ListChecks, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLive } from '../../lib/live'
import { cairoLocalToISO, formatCairo, isoToCairoLocal, serverNow, syncServerTime } from '../../lib/time'
import { storagePathFromUrl } from '../../lib/image'
import AdminLayout from '../../components/admin/AdminLayout'
import Modal from '../../components/admin/Modal'
import { confirmDialog, toast } from '../../components/admin/feedback'

interface Exam {
  id: string
  name: string
  description: string | null
  course_id: string | null
  image_url: string | null
  publish_at: string | null
  created_at: string
}
interface ExamStat { exam_id: string; questions: number; attempts: number; avg_score: number | null }

const emptyForm = { name: '', description: '', mode: 'now' as 'now' | 'schedule', date: '' }

export default function AdminExams() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    syncServerTime().then(() => setTick((t) => t + 1))
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const { data, loading, connected, reload } = useLive(
    async () => {
      const [c, e, s] = await Promise.all([
        supabase.from('courses').select('name').eq('id', courseId).single(),
        supabase.from('exams').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
        supabase.rpc('admin_exam_stats'),
      ])
      const stats: Record<string, ExamStat> = {}
      ;((s.data as ExamStat[]) || []).forEach((x) => { stats[x.exam_id] = x })
      return { courseName: (c.data?.name as string) || '', exams: (e.data || []) as Exam[], stats }
    },
    ['exams', 'questions', 'exam_attempts']
  )

  const exams = data?.exams || []

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true) }
  const openEdit = (x: Exam) => {
    setEditing(x)
    setForm({ name: x.name, description: x.description || '', mode: x.publish_at ? 'schedule' : 'now', date: x.publish_at ? isoToCairoLocal(x.publish_at) : '' })
    setOpen(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return toast('اكتب اسم الامتحان', 'error')
    if (form.mode === 'schedule' && !form.date) return toast('اختار ميعاد الظهور', 'error')
    setSaving(true)
    try {
      const publish_at = form.mode === 'schedule' && form.date ? cairoLocalToISO(form.date) : null
      const payload = { name: form.name.trim(), description: form.description.trim() || null, publish_at }
      if (editing) {
        const { error } = await supabase.from('exams').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('exams').insert({ ...payload, course_id: courseId })
        if (error) throw error
      }
      toast(editing ? 'اتعدّل الامتحان ✅' : 'الامتحان اتضاف ✅')
      setOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || 'حصلت مشكلة', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (x: Exam) => {
    const ok = await confirmDialog({
      title: `تمسح امتحان "${x.name}"؟`,
      message: 'كل الأسئلة والصور بتاعته هتتمسح معاه.',
      confirmText: 'امسح',
      danger: true,
    })
    if (!ok) return
    try {
      const { data: imgs } = await supabase.from('questions').select('image_url').eq('exam_id', x.id).not('image_url', 'is', null)
      const paths = [x.image_url, ...((imgs || []).map((i: any) => i.image_url as string))].map(storagePathFromUrl).filter(Boolean) as string[]
      const { error } = await supabase.from('exams').delete().eq('id', x.id)
      if (error) throw error
      if (paths.length) await supabase.storage.from('images').remove(paths)
      toast('الامتحان اتمسح')
      reload()
    } catch (err: any) {
      toast(err?.message || 'حصلت مشكلة', 'error')
    }
  }

  return (
    <AdminLayout
      title={data?.courseName ? `امتحانات ${data.courseName}` : 'الامتحانات'}
      subtitle="كل امتحان وأرقامه لحظة بلحظة"
      live={connected}
      back={{ label: 'رجوع للمواد', to: '/admin/exams' }}
      actions={
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium shadow-lg shadow-emerald-600/20">
          <Plus className="w-4 h-4" />
          ضيف امتحان
        </button>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <div key={i} className="h-60 rounded-3xl bg-slate-200/60 animate-pulse" />)}</div>
      ) : exams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">مفيش امتحانات في المادة دي لسه</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {exams.map((x) => {
            const st = data?.stats[x.id]
            const scheduled = !!x.publish_at && new Date(x.publish_at).getTime() > serverNow()
            return (
              <div key={x.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-emerald-700" />
                  </div>
                  {scheduled ? (
                    <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      هيظهر {formatCairo(x.publish_at!)}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      ظاهر للطلبة
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-1">{x.name}</h3>
                {x.description && <p className="text-sm text-slate-500 mb-3 line-clamp-2">{x.description}</p>}

                <div className="grid grid-cols-3 gap-2 my-3 text-center">
                  <div className="rounded-xl bg-slate-50 py-2"><div className="font-bold text-slate-800">{st?.questions ?? 0}</div><div className="text-[11px] text-slate-500">سؤال</div></div>
                  <div className="rounded-xl bg-sky-50 py-2"><div className="font-bold text-sky-700">{st?.attempts ?? 0}</div><div className="text-[11px] text-sky-600">حل</div></div>
                  <div className="rounded-xl bg-amber-50 py-2"><div className="font-bold text-amber-700">{st?.avg_score != null ? `${st.avg_score}%` : '-'}</div><div className="text-[11px] text-amber-600">المتوسط</div></div>
                </div>

                <div className="mt-auto flex items-center gap-2 pt-2">
                  <button onClick={() => navigate(`/admin/exams/${x.id}/questions`)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold">
                    <ListChecks className="w-4 h-4" />
                    تعديل الأسئلة
                  </button>
                  <button onClick={() => navigate(`/admin/import?examId=${x.id}`)} className="p-2.5 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100" title="رفع أسئلة من Excel" aria-label="رفع Excel">
                    <FileSpreadsheet className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(x)} className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100" aria-label="تعديل"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => remove(x)} className="p-2.5 rounded-xl text-red-600 hover:bg-red-50" aria-label="مسح"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? 'تعديل الامتحان' : 'ضيف امتحان جديد'}
          onClose={() => !saving && setOpen(false)}
          maxWidth="max-w-md"
          footer={
            <div className="flex gap-2">
              <button form="exam-form" type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-60">{saving ? 'بيتحفظ...' : 'حفظ'}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700">إلغاء</button>
            </div>
          }
        >
          <form id="exam-form" onSubmit={save} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">اسم الامتحان *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">وصف (اختياري)</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">يظهر للطلبة امتى؟</label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 mb-3">
                {([['now', 'دلوقتي'], ['schedule', 'في ميعاد معين']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, mode: v })} className={`py-2 rounded-lg text-sm font-semibold ${form.mode === v ? 'bg-white text-emerald-700 shadow' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
              {form.mode === 'schedule' && (
                <>
                  <input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" />
                  <p className="text-xs text-slate-500 mt-2">الميعاد بتوقيت القاهرة، والظهور بيتحدد بساعة السيرفر مش جهاز الطالب.</p>
                </>
              )}
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  )
}
