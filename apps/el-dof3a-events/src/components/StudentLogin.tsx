import { useState, type FormEvent } from 'react'
import { Fingerprint, GraduationCap, LogIn } from 'lucide-react'
import { btnPrimary, inputCls, Spinner } from './ui'
import { errText, rpc, saveStudent, type Student } from '../lib/api'
import { onlyDigits } from '../lib/input'
import { feedbackBad, feedbackOk, unlockAudio } from '../lib/sound'

const NID_LEN = 14
const ACAD_LEN = 8

/** two numbers identify the student — whichever one is missing in the database gets filled in on the first login */
export default function StudentLogin({ onStudent }: { onStudent: (s: Student) => void }) {
  const [nid, setNid] = useState('')
  const [acad, setAcad] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const nidOk = nid.length === NID_LEN
  const acadOk = acad.length === ACAD_LEN

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    unlockAudio()
    if (busy) return
    if (!nidOk) { setErr(`الرقم القومي لازم يكون ${NID_LEN} رقم — كتبته ${nid.length}`); return }
    if (!acadOk) { setErr(`الرقم الأكاديمي لازم يكون ${ACAD_LEN} أرقام — كتبت ${acad.length}`); return }
    setBusy(true); setErr('')
    try {
      const s = await rpc<Student | null>('md_login_student', { p_nid: nid, p_academic: acad })
      if (!s) { feedbackBad(); setErr('الأرقام دي مش موجودة في كشف المسموح لهم. راجعها تاني أو كلّم المنظمين.') }
      else { feedbackOk(); saveStudent(s); onStudent(s) }
    } catch (e) { feedbackBad(); setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        icon={<Fingerprint className="w-5 h-5" />} label="الرقم القومي"
        value={nid} max={NID_LEN} done={nidOk} onChange={setNid} placeholder="XXXXXXXXXXXXXX" autoFocus
      />
      <Field
        icon={<GraduationCap className="w-5 h-5" />} label="الرقم الأكاديمي"
        value={acad} max={ACAD_LEN} done={acadOk} onChange={setAcad} placeholder="24XXXXXX"
      />

      {err && <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm q-enter">{err}</div>}

      <button type="submit" className={`${btnPrimary} w-full py-4 text-lg`} disabled={busy}>
        {busy ? <Spinner /> : <LogIn className="w-5 h-5" />} دخول
      </button>
    </form>
  )
}

function Field({ icon, label, value, max, done, onChange, placeholder, autoFocus }: {
  icon: React.ReactNode; label: string; value: string; max: number
  done: boolean; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink">{icon}{label}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${done ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted'}`} dir="ltr">{value.length}/{max}</span>
      </div>
      <input
        className={`${inputCls} py-4 text-xl font-bold tracking-[.18em] tabular-nums text-center ${done ? 'border-emerald-500/60' : ''}`}
        dir="ltr" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false}
        autoFocus={autoFocus} maxLength={max} placeholder={placeholder} value={value}
        onChange={(e) => onChange(onlyDigits(e.target.value, max))}
      />
    </label>
  )
}
