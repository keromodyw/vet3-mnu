import { Check, Edit, Trash2 } from 'lucide-react'
import { isEssay, type QuestionRow } from '../../lib/questionType'
import Highlight from './Highlight'

const LETTERS = { A: 'أ', B: 'ب', C: 'ج', D: 'د' } as const

interface Props {
  q: QuestionRow
  number?: number
  tokens?: string[]
  crumb?: string
  onEdit: () => void
  onDelete: () => void
}

export default function QuestionCard({ q, number, tokens = [], crumb, onEdit, onDelete }: Props) {
  const essay = isEssay(q)
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {number !== undefined && (
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{number}</span>
          )}
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${essay ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
            {essay ? 'مقالي' : 'اختيار من متعدد'}
          </span>
          {crumb && <span className="text-xs text-slate-400 truncate">{crumb}</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100">
            <Edit className="w-3.5 h-3.5" />
            عدّل
          </button>
          <button onClick={onDelete} className="p-2 rounded-lg text-red-600 hover:bg-red-50" aria-label="مسح">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p dir="auto" className="text-slate-900 font-semibold leading-relaxed text-start whitespace-pre-line">
        <Highlight text={q.question_text} tokens={tokens} />
      </p>

      {q.image_url && <img src={q.image_url} alt="" loading="lazy" className="mt-3 max-h-44 rounded-xl border border-slate-200" />}

      {essay ? (
        <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <div className="text-xs font-bold text-emerald-700 mb-1">الإجابة النموذجية</div>
          <p dir="auto" className="text-sm text-slate-800 leading-relaxed text-start whitespace-pre-line"><Highlight text={q.option_a || ''} tokens={tokens} /></p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(['A', 'B', 'C', 'D'] as const).map((k) => {
            const text = q[`option_${k.toLowerCase()}` as 'option_a']
            if (!text) return null
            const ok = q.correct_answer === k
            return (
              <div key={k} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${ok ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>{LETTERS[k]}</span>
                <span dir="auto" className="flex-1 text-start"><Highlight text={text} tokens={tokens} /></span>
                {ok && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      )}

      {q.explanation && (
        <p dir="auto" className="mt-3 text-xs text-slate-500 leading-relaxed text-start">
          <b className="text-slate-600">الشرح: </b>
          <Highlight text={q.explanation} tokens={tokens} />
        </p>
      )}
    </div>
  )
}
