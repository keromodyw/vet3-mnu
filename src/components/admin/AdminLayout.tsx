import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink, FileSpreadsheet, Folder, LayoutDashboard, LogOut, Menu, Search, UserCog, X, ArrowRight } from 'lucide-react'
import { Toaster } from './feedback'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  back?: { label: string; to: string }
  live?: boolean
  children: ReactNode
}

export default function AdminLayout({ title, subtitle, actions, back, live, children }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<{ name?: string; role?: string } | null>(null)
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (localStorage.getItem('admin_auth') !== 'true') {
      navigate('/admin/login', { replace: true })
      return
    }
    try { setUser(JSON.parse(localStorage.getItem('admin_user') || 'null')) } catch { /* ignore */ }
    setReady(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { setOpen(false) }, [pathname])

  if (!ready) return null

  const logout = () => {
    localStorage.removeItem('admin_auth')
    localStorage.removeItem('admin_user')
    navigate('/admin/login')
  }

  const nav = [
    { icon: LayoutDashboard, label: 'الرئيسية', path: '/admin', match: (p: string) => p === '/admin' },
    { icon: Folder, label: 'المواد والامتحانات', path: '/admin/exams', match: (p: string) => p.startsWith('/admin/exams') || p.startsWith('/admin/courses') },
    { icon: Search, label: 'دوّر في الأسئلة', path: '/admin/search', match: (p: string) => p.startsWith('/admin/search') },
    { icon: FileSpreadsheet, label: 'رفع أسئلة من Excel', path: '/admin/import', match: (p: string) => p.startsWith('/admin/import') },
    ...(user?.role === 'super_admin' ? [{ icon: UserCog, label: 'المستخدمين', path: '/admin/users', match: (p: string) => p.startsWith('/admin/users') }] : []),
  ]

  const sidebar = (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950">
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="" className="w-9 h-9 rounded-full ring-2 ring-emerald-500/40" />
          <div className="leading-tight">
            <div className="text-white font-bold">يلا نذاكر</div>
            <div className="text-[11px] text-emerald-300/80">شاشة الأدمن</div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="lg:hidden text-slate-400 hover:text-white" aria-label="إغلاق">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {nav.map((item) => {
          const active = item.match(pathname)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {active && <span className="absolute right-0 top-2 bottom-2 w-1 rounded-full bg-emerald-400" />}
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1 flex-shrink-0">
        <a
          href={import.meta.env.BASE_URL}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <ExternalLink className="w-4 h-4" />
          افتح الموقع
        </a>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold">
            {(user?.name || 'أ').trim().charAt(0)}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-sm text-white truncate">{user?.name || 'أدمن'}</div>
            <div className="text-[11px] text-slate-400">{user?.role === 'super_admin' ? 'سوبر أدمن' : 'أدمن'}</div>
          </div>
          <button onClick={logout} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" aria-label="خروج" title="خروج">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="hidden lg:block fixed inset-y-0 right-0 w-64 z-40">{sidebar}</aside>

      {open && <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm" onClick={() => setOpen(false)} />}
      <aside className={`lg:hidden fixed inset-y-0 right-0 w-72 max-w-[85vw] z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>{sidebar}</aside>

      <div className="lg:mr-64 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-lg border-b border-slate-200">
          <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden p-2 -mr-2 rounded-xl hover:bg-slate-100" aria-label="القائمة">
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
            </div>

            <form
              className="hidden md:block relative w-64 lg:w-72"
              onSubmit={(e) => {
                e.preventDefault()
                navigate(`/admin/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
                setQ('')
                searchRef.current?.blur()
              }}
            >
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="دوّر في كل الأسئلة...  (Ctrl+K)"
                className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-100 border border-transparent focus:bg-white focus:border-emerald-400 focus:outline-none text-sm transition-colors"
              />
            </form>

            {live !== undefined && (
              <div
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                <span className="relative flex h-2 w-2">
                  {live && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </span>
                {live ? 'لايف' : 'تحديث تلقائي'}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {(back || actions) && (
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              {back ? (
                <button onClick={() => navigate(back.to)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
                  <ArrowRight className="w-4 h-4" />
                  {back.label}
                </button>
              ) : <span />}
              <div className="flex items-center gap-2 flex-wrap">{actions}</div>
            </div>
          )}
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  )
}
