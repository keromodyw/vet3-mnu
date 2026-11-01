import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidth?: string
  footer?: ReactNode
  /** take the whole screen on phones (a card again from `sm` up) — used by the seat picker */
  full?: boolean
  /** no padding around the body, so a panel can run edge to edge */
  flush?: boolean
}

export default function Modal({ title, onClose, children, maxWidth = 'max-w-lg', footer, full = false, flush = false }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div className={`fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex justify-center ${full ? 'items-stretch p-0 sm:items-center sm:p-6' : 'items-center p-3 sm:p-6'}`} onMouseDown={onClose}>
      <div
        className={`q-enter bg-surface text-ink border border-line shadow-2xl w-full flex flex-col ${maxWidth} ${full ? 'h-full max-h-none rounded-none sm:h-auto sm:max-h-[92vh] sm:rounded-3xl' : 'rounded-3xl max-h-[92vh]'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 sm:py-4 border-b border-line shrink-0">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-muted hover:bg-ink/10 hover:text-ink" aria-label="إغلاق"><X className="w-5 h-5" /></button>
        </div>
        <div className={`overflow-y-auto flex-1 ${flush ? '' : 'p-6'}`}>{children}</div>
        {footer && <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-line bg-ink/[.03] shrink-0 sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>
  )
}
