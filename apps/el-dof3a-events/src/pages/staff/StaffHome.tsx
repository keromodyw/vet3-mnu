import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { FullLoader } from '../../components/ui'
import { NAV } from '../../components/StaffLayout'
import { useStaff } from '../../lib/staff'

/** sends each role to its first allowed screen */
export default function StaffHome() {
  const navigate = useNavigate()
  const { loading, staff, error, hasSession, signOut } = useStaff()
  if (loading) return <FullLoader />
  if (!hasSession) return <Navigate to="/staff/login" replace />
  if (!staff) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <p className="max-w-sm leading-relaxed">{error}</p>
        <button className="underline text-muted" onClick={async () => { await signOut(); navigate('/staff/login') }}>تسجيل خروج</button>
      </div>
    )
  }
  const first = NAV.find((n) => n.roles.includes(staff.role))
  return <Navigate to={first ? first.to : '/staff/login'} replace />
}
