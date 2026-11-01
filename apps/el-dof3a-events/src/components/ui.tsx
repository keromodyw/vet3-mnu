import { useState, type ReactNode } from 'react'
import { Check, Loader2, Moon, Sun } from 'lucide-react'

export const inputCls = 'w-full px-4 py-3 rounded-xl bg-surface border-2 border-line text-ink placeholder-slate-400 focus:outline-none focus:border-emerald-500'
export const lightInputCls = inputCls
export const btnPrimary = 'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/40 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none transition'
export const btnGhost = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-ink bg-surface border border-line hover:bg-ink/5 disabled:opacity-50 transition'
export const card = 'rounded-3xl bg-surface border border-line shadow-sm'

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className || 'w-5 h-5'}`} />
}
export function FullLoader() {
  return <div className="min-h-[50vh] flex items-center justify-center text-emerald-600"><Spinner className="w-8 h-8" /></div>
}

/* ---------- light / dark ---------- */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('eld_theme', next ? 'dark' : 'light') } catch { /* private mode */ }
    setDark(next)
  }
  return { dark, toggle }
}
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { dark, toggle } = useTheme()
  return (
    <button onClick={toggle} aria-label="تغيير المظهر" title={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}
      className={`p-2.5 rounded-xl bg-surface border border-line text-ink hover:bg-ink/5 transition ${className}`}>
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}

export function Logo({ className = 'w-12 h-12' }: { className?: string }) {
  return <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="MNU Vet3" className={`${className} rounded-2xl object-cover ring-1 ring-line shadow-md bg-white`} />
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo className={small ? 'w-10 h-10' : 'w-14 h-14'} />
      <div className="leading-tight">
        <div className={`${small ? 'text-base' : 'text-xl'} font-black text-ink`}>إيفينتات الدفعة</div>
        <div className="text-[11px] text-muted tracking-wide">MNU Vet 3 Events</div>
      </div>
    </div>
  )
}

/** labels: the steps this event actually has · step: index of the current one (labels.length = all done) */
export function Stepper({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol className="flex items-start justify-between mb-6" aria-label="خطوات الحجز">
      {labels.map((s, i) => {
        const done = i < step, cur = i === step
        return (
          <li key={s} className="flex-1 flex flex-col items-center gap-1 relative">
            {i > 0 && <span className={`absolute top-4 -right-1/2 w-full h-0.5 ${i <= step ? 'bg-emerald-500' : 'bg-line'}`} />}
            <span className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${done ? 'bg-emerald-600 border-emerald-600 text-white' : cur ? 'border-emerald-600 text-emerald-700 dark:text-emerald-300 bg-surface' : 'border-line text-muted bg-surface'}`}>
              {done ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <span className={`text-[11px] text-center ${cur ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-muted'}`}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** the steps shown for an event, depending on how it is set up */
export function stepLabels(mode: 'seats' | 'names', payment: boolean): string[] {
  return ['الإيفينت', 'الكارنيه', ...(mode === 'seats' ? ['الكرسي'] : []), ...(payment ? ['الدفع'] : []), 'المراجعة']
}

export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto px-4 pt-5 pb-16 ${wide ? 'max-w-5xl' : 'max-w-xl'}`} style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
      {children}
    </div>
  )
}

export function Badge({ children, tone = 'zinc' }: { children: ReactNode; tone?: 'zinc' | 'green' | 'amber' | 'red' | 'sky' | 'pink' }) {
  const t = {
    zinc: 'bg-ink/10 text-ink/80',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    red: 'bg-red-500/15 text-red-700 dark:text-red-300',
    sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  }[tone]
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${t}`}>{children}</span>
}
