import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { compressImage, storagePathFromUrl } from '../../lib/image'
import { isEssay, type QuestionRow } from '../../lib/questionType'
import Modal from './Modal'
import { toast } from './feedback'

interface Props {
  question: QuestionRow | null
  examId: string
  nextOrder?: number
  onClose: () => void
  onSaved: () => void
}

const LETTERS: { key: 'A' | 'B' | 'C' | 'D'; label: string }[] = [
  { key: 'A', label: 'أ' },
  { key: 'B', label: 'ب' },
  { key: 'C', label: 'ج' },
  { key: 'D', label: 'د' },
]

const input = 'w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none transition-colors'

export default function QuestionEditor({ question, examId, nextOrder = 0, onClose, onSaved }: Props) {
  const editing = !!question
  const [type, setType] = useState<'mcq' | 'essay'>(question ? (isEssay(question) ? 'essay' : 'mcq') : 'mcq')
  const [text, setText] = useState(question?.question_text || '')
  const [opts, setOpts] = useState({
    A: question && !isEssay(question) ? question.option_a || '' : '',
    B: question?.option_b || '',
    C: question?.option_c || '',
    D: question?.option_d || '',
  })
  const [essayAnswer, setEssayAnswer] = useState(question && isEssay(question) ? question.option_a || '' : '')
  const [correct, setCorrect] = useState<'A' | 'B' | 'C' | 'D'>(question?.correct_answer || 'A')
  const [explanation, setExplanation] = useState(question?.explanation || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [existingImage, setExistingImage] = useState<string | null>(question?.image_url || null)
  const [saving, setSaving] = useState(false)

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('اختار ملف صورة بس', 'error')
    if (file.size > 15 * 1024 * 1024) return toast('الصورة كبيرة قوي (الحد الأقصى 15MB)', 'error')
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    setImageFile(null)
    setPreview('')
    setExistingImage(null)
  }

  const upload = async (file: File) => {
    const compressed = await compressImage(file)
    const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `questions/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, compressed, {
      contentType: compressed.type || undefined,
      cacheControl: '31536000',
    })
    if (error) throw error
    return supabase.storage.from('images').getPublicUrl(path).data.publicUrl
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return toast('اكتب نص السؤال الأول', 'error')

    if (type === 'essay') {
      if (!essayAnswer.trim()) return toast('اكتب الإجابة النموذجية للسؤال المقالي', 'error')
    } else {
      const filled = LETTERS.filter((l) => opts[l.key].trim())
      if (filled.length < 2) return toast('لازم اختيارين على الأقل', 'error')
      if (!opts[correct].trim()) return toast('الإجابة الصح لازم تكون واحد من الاختيارات المكتوبة', 'error')
    }

    setSaving(true)
    try {
      const original = question?.image_url ?? null
      let image_url: string | null = existingImage
      if (imageFile) image_url = await upload(imageFile)

      const base =
        type === 'essay'
          ? { option_a: essayAnswer.trim(), option_b: null, option_c: null, option_d: null, correct_answer: 'A', question_type: 'essay' }
          : {
              option_a: opts.A.trim() || null,
              option_b: opts.B.trim() || null,
              option_c: opts.C.trim() || null,
              option_d: opts.D.trim() || null,
              correct_answer: correct,
              question_type: 'mcq',
            }
      const payload = { ...base, question_text: t, explanation: explanation.trim() || null, image_url }

      if (editing) {
        const { error } = await supabase.from('questions').update(payload).eq('id', question!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('questions').insert({ ...payload, exam_id: examId, order_index: nextOrder })
        if (error) throw error
      }

      if (original && original !== image_url) {
        const old = storagePathFromUrl(original)
        if (old) await supabase.storage.from('images').remove([old])
      }

      toast(editing ? 'اتحفظ التعديل ✅' : 'السؤال اتضاف ✅')
      onSaved()
      onClose()
    } catch (err: any) {
      console.error(err)
      const msg: string = err?.message || 'حصلت مشكلة'
      toast(msg.includes('question_type') ? 'شغّل ملف admin_upgrade.sql في Supabase الأول (عمود نوع السؤال ناقص)' : msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const shownImage = preview || existingImage

  return (
    <Modal
      title={editing ? 'تعديل السؤال' : 'ضيف سؤال جديد'}
      onClose={saving ? () => {} : onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex gap-2">
          <button form="q-form" type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-60">
            {saving ? 'بيتحفظ...' : 'حفظ'}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-medium">
            إلغاء
          </button>
        </div>
      }
    >
      <form id="q-form" onSubmit={save} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">نوع السؤال</label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
            {([['mcq', 'اختيار من متعدد'], ['essay', 'مقالي']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setType(v)}
                className={`py-2 rounded-lg text-sm font-semibold transition-all ${type === v ? 'bg-white text-emerald-700 shadow' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">نص السؤال *</label>
          <textarea dir="auto" value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${input} text-start`} />
        </div>

        {type === 'mcq' ? (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">الاختيارات (دوس على الدايرة عند الإجابة الصح)</label>
            <div className="space-y-2">
              {LETTERS.map((l) => (
                <div key={l.key} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCorrect(l.key)}
                    className={`w-10 h-10 rounded-full flex-shrink-0 font-bold border-2 transition-all ${correct === l.key ? 'bg-emerald-600 border-emerald-600 text-white scale-110' : 'bg-white border-slate-300 text-slate-500 hover:border-emerald-400'}`}
                    title="الإجابة الصح"
                  >
                    {l.label}
                  </button>
                  <input
                    dir="auto"
                    value={opts[l.key]}
                    onChange={(e) => setOpts({ ...opts, [l.key]: e.target.value })}
                    className={`${input} text-start ${correct === l.key ? 'border-emerald-400 bg-emerald-50/50' : ''}`}
                    placeholder={`الاختيار ${l.label}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">الإجابة النموذجية * (الطالب بيتصحح عليها)</label>
            <textarea dir="auto" value={essayAnswer} onChange={(e) => setEssayAnswer(e.target.value)} rows={4} className={`${input} text-start`} />
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">شرح الإجابة (اختياري)</label>
          <textarea dir="auto" value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className={`${input} text-start`} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">صورة السؤال (اختياري)</label>
          {shownImage ? (
            <div className="relative inline-block">
              <img src={shownImage} alt="" className="max-h-52 rounded-xl border-2 border-slate-200" />
              <button type="button" onClick={removeImage} className="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg" aria-label="احذف الصورة">
                <X className="w-4 h-4" />
              </button>
              <label className="block mt-2 text-sm text-emerald-700 cursor-pointer hover:underline">
                غيّر الصورة
                <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
              </label>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50/40 cursor-pointer transition-colors">
              <ImagePlus className="w-7 h-7" />
              <span className="text-sm">دوس هنا واختار صورة</span>
              <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </label>
          )}
        </div>
      </form>
    </Modal>
  )
}
