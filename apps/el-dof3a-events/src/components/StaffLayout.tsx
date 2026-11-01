import { useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, CalendarDays, ClipboardCheck, Database, LogOut, Radio, ScanLine, ShieldAlert, Users } from 'lucide-react'
import { Brand, FullLoader, ThemeToggle } from './ui'
import type { Role } from '../lib/api'
import { useStaff } from '../lib/staff'

export const NAV: Array<{ to: string; label: string; icon: typeof Users; roles: Role[] }> = [
  { to: '/staff/events', label: 'الإيفينتات والكراسي', icon: CalendarDays, roles: ['super_admin'] },
  { to: '/staff/bookings', label: 'الحجوزات', icon: ClipboardCheck, roles: ['super_admin', 'reviewer'] },
  { to: '/staff/scanner', label: 'السكانر', icon: ScanLine, roles: ['super_admin', 'scanner'] },
  { to: '/staff/live', label: 'متابعة السكان', icon: Radio, roles: ['super_admin'] },
  { to: '/staff/analytics', label: 'التقارير', icon: BarChart3, roles: ['super_admin'] },
  { to: '/staff/students', label: 'قاعدة الطلاب', icon: Database, roles: ['super_admin'] },
  { to: '/staff/team', label: 'الفريق', icon: Users, roles: ['super_admin'] },
]

interface Props { title: string; roles: Role[]; actions?: ReactNode; live?: boolean; children: ReactNode; wide?: boolean }

export default function StaffLayout({ title, roles, actions, children, wide }: Props) {
  const navigate = useNavigate()
  const { loading, staff, error, hasSession, signOut } = useStaff()

  useEffect(() => { if (!loading && !hasSession) navigate('/staff/login', { replace: true }) }, [loading, hasSession, navigate])

  if (loading || !hasSession) return <FullLoader />
  if (!staff) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <p className="max-w-sm leading-relaxed">{error}</p>
        <button className="underline text-muted" onClick={async () => { await signOut(); navigate('/staff/login') }}>تسجيل خروج</button>
      </div>
    )
  }
  if (!roles.includes(staff.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
        <ShieldAlert className="w-12 h-12 text-amber-500" />
        <p>مفيش عندك صلاحية للصفحة دي.</p>
        <button className="underline text-muted" onClick={() => navigate('/staff')}>رجوع</button>
      </div>
    )
  }

  const links = NAV.filter((n) => n.roles.includes(staff.role))
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-page/90 backdrop-blur border-b border-line" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Brand small />
          <div className="flex-1" />
          <span className="text-sm font-semibold text-ink/80 max-w-[8rem] truncate">{staff.name}</span>
          <ThemeToggle />
          <button onClick={async () => { await signOut(); navigate('/staff/login') }} className="p-2.5 rounded-xl bg-surface border border-line text-muted hover:text-ink" title="خروج"><LogOut className="w-5 h-5" /></button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 pb-2 flex gap-1.5 overflow-x-auto">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${isActive ? 'bg-emerald-600 text-white' : 'text-ink/80 bg-ink/5 hover:bg-ink/10'}`}>
              <l.icon className="w-4 h-4" />{l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-black">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
        {children}
      </main>
    </div>
  )
}
