import { useState } from 'react'
import { Edit, Folder, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLive } from '../../lib/live'
import { compressImage, storagePathFromUrl } from '../../lib/image'
import AdminLayout from '../../components/admin/AdminLayout'
import Modal from '../../components/admin/Modal'
import { confirmDialog, toast } from '../../components/admin/feedback'

interface Course { id: string; name: string; image_url: string | null; created_at: string }

export default function AdminCourses() {
  const { data, loading, connected, reload } = useLive<Course[]>(
    async () => {
      const { data, error } = await supabase.from('courses').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Course[]
    },
    ['courses']
  )
  const courses = data || []

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)

  const openNew = () => { setEditing(null); setName(''); setFile(null); setPreview(''); setOpen(true) }
  const openEdit = (c: Course) => { setEditing(c); setName(c.name); setFile(null); setPreview(c.image_url || ''); setOpen(true) }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) return toast('اختار صورة بس', 'error')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast('اكتب اسم المادة', 'error')
    setSaving(true)
    try {
      let image_url: string | null = editing?.image_url ?? null
      if (file) {
        const c = await compressImage(file, 1200)
        const ext = (c.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `courses/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('images').upload(path, c, { contentType: c.type || undefined, cacheControl: '31536000' })
        if (upErr) throw upErr
        image_url = supabase.storage.from('images').getPublicUrl(path).data.publicUrl
      }
      if (editing) {
        const { error } = await supabase.from('courses').update({ name: name.trim(), image_url }).eq('id', editing.id)
        if (error) throw error
        if (file && editing.image_url) {
          const old = storagePathFromUrl(editing.image_url)
          if (old) await supabase.storage.from('images').remove([old])
        }
      } else {
        const { error } = await supabase.from('courses').insert({ name: name.trim(), image_url })
        if (error) throw error
      }
      toast(editing ? 'اتعدّلت المادة ✅' : 'المادة اتضافت ✅')
      setOpen(false)
      reload()
    } catch (err: any) {
      toast(err?.message || 'حصلت مشكلة', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c: Course) => {
    const ok = await confirmDialog({
      title: `تمسح مادة "${c.name}"؟`,
      message: 'كل الامتحانات والأسئلة والصور اللي جواها هتتمسح معاها.',
      confirmText: 'امسح',
      danger: true,
    })
    if (!ok) return
    try {
      const { error } = await supabase.from('courses').delete().eq('id', c.id)
      if (error) throw error
      const path = storagePathFromUrl(c.image_url)
      if (path) await supabase.storage.from('images').remove([path])
      toast('المادة اتمسحت')
      reload()
    } catch (err: any) {
      toast(err?.message || 'حصلت مشكلة', 'error')
    }
  }

  return (
    <AdminLayout
      title="تعديل المواد"
     
      live={connected}
      back={{ label: 'رجوع للمواد والامتحانات', to: '/admin/exams' }}
      actions={
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium shadow-lg shadow-emerald-600/20">
          <Plus className="w-4 h-4" />
          ضيف مادة
        </button>
      }
    >
      {loading ? (
        <div className="h-40 rounded-3xl bg-slate-200/60 animate-pulse" />
      ) : courses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">مفيش مواد لسه</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((c) => (
            <div key={c.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
              {c.image_url ? (
                <img src={c.image_url} alt={c.name} className="w-full h-32 object-cover" />
              ) : (
                <div className="w-full h-32 bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                  <Folder className="w-9 h-9 text-emerald-700/70" />
                </div>
              )}
              <div className="p-4 flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900 truncate">{c.name}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="تعديل"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => remove(c)} className="p-2 rounded-lg text-red-600 hover:bg-red-50" aria-label="مسح"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? 'تعديل المادة' : 'ضيف مادة جديدة'}
          onClose={() => !saving && setOpen(false)}
          maxWidth="max-w-md"
          footer={
            <div className="flex gap-2">
              <button form="course-form" type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-60">{saving ? 'بيتحفظ...' : 'حفظ'}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700">إلغاء</button>
            </div>
          }
        >
          <form id="course-form" onSubmit={save} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">اسم المادة *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">صورة المادة (اختياري)</label>
              {preview ? (
                <div>
                  <img src={preview} alt="" className="w-full h-40 object-cover rounded-2xl border-2 border-slate-200" />
                  <label className="inline-block mt-2 text-sm text-emerald-700 cursor-pointer hover:underline">
                    غيّر الصورة
                    <input type="file" accept="image/*" onChange={pick} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 py-7 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50/40 cursor-pointer">
                  <ImagePlus className="w-7 h-7" />
                  <span className="text-sm">دوس واختار صورة</span>
                  <input type="file" accept="image/*" onChange={pick} className="hidden" />
                </label>
              )}
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  )
}
