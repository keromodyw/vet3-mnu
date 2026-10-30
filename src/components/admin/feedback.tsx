import { useEffect, useState } from 'react'
import { CheckCircle2, Info, Trash2, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; type: ToastType }
interface ConfirmReq { title: string; message?: string; confirmText?: string; danger?: boolean; resolve: (v: boolean) => void }

const toastListeners = new Set<(t: ToastItem) => void>()
let toastId = 1
let confirmListener: ((r: ConfirmReq) => void) | null = null

export function toast(message: string, type: ToastType = 'success') {
  const t = { id: toastId++, message, type }
  toastListeners.forEach((l) => l(t))
}

export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmListener) {
      resolve(window.confirm(opts.title))
      return
    }
    confirmListener({ ...opts, resolve })
  })
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [req, setReq] = useState<ConfirmReq | null>(null)

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setToasts((prev) => [...prev, t])
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500)
    }
    toastListeners.add(onToast)
    confirmListener = setReq
    return () => {
      toastListeners.delete(onToast)
      confirmListener = null
    }
  }, [])

  const answer = (v: boolean) => {
    req?.resolve(v)
    setReq(null)
  }

  const icon = (t: ToastType) =>
    t === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : t === 'error' ? <XCircle className="w-5 h-5 text-red-400" /> : <Info className="w-5 h-5 text-sky-400" />

  return (
    <>
      <div className="fixed bottom-5 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="q-enter pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl max-w-md text-sm">
            {icon(t.type)}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {req && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => answer(false)}>
          <div className="q-enter bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {req.danger && (
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
            )}
            <h3 className="text-lg font-bold text-slate-900 mb-1">{req.title}</h3>
            {req.message && <p className="text-sm text-slate-500 leading-relaxed mb-5">{req.message}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => answer(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200">لأ، سيبه</button>
              <button
                onClick={() => answer(true)}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold ${req.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {req.confirmText || 'تمام'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
