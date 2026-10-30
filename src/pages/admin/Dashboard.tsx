import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Database, FileText, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLive } from '../../lib/live'
import { formatDuration, num, timeAgo } from '../../lib/format'
import AdminLayout from '../../components/admin/AdminLayout'
import AnimatedNumber from '../../components/admin/AnimatedNumber'

interface Day { day: string; visitors: number; attempts: number }
interface Stats {
  unique_visitors: number
  visits_total: number
  visitors_today: number
  attempts_total: number
  attempts_today: number
  avg_score: number | null
  courses: number
  exams: number
  questions: number
  daily: Day[] | null
  recent: { id: number; score: number; correct: number; total: number; time_taken: number | null; created_at: string; exam_name: string }[]
  top_exams: { id: string; name: string; attempts: number; avg_score: number | null }[]
}

function DailyChart({ data }: { data: Day[] }) {
  const W = 700, H = 230, L = 36, R = 8, T = 14, B = 30
  const max = Math.max(5, ...data.flatMap((d) => [d.visitors, d.attempts]))
  const top = Math.ceil(max / 5) * 5
  const iw = W - L - R
  const ih = H - T - B
  const gw = iw / data.length
  const bw = Math.min(14, gw / 2.7)
  const y = (v: number) => T + ih - (v / top) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(top * p))

  return (
    <div dir="ltr" className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="الزوار والحلول آخر 14 يوم">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-slate-100" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-400" fontSize="10">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + i * gw + gw / 2
          const [, m, dd] = d.day.split('-')
          return (
            <g key={d.day}>
              <rect x={cx - bw - 1} y={y(d.visitors)} width={bw} height={ih - (y(d.visitors) - T)} rx="3" className="fill-emerald-500">
                <title>{`${dd}/${m} — زوار: ${d.visitors}`}</title>
              </rect>
              <rect x={cx + 1} y={y(d.attempts)} width={bw} height={ih - (y(d.attempts) - T)} rx="3" className="fill-sky-500">
                <title>{`${dd}/${m} — حلول: ${d.attempts}`}</title>
              </rect>
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-slate-400" fontSize="10">{`${Number(dd)}/${Number(m)}`}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [setupError, setSetupError] = useState(false)

  const { data: stats, loading, connected } = useLive<Stats | null>(
    async () => {
      const { data, error } = await supabase.rpc('admin_stats')
      if (error) {
        setSetupError(true)
        throw error
      }
      setSetupError(false)
      return data as Stats
    },
    ['exam_attempts', 'site_visits', 'exams', 'questions', 'courses'],
    10000
  )

  let userName = ''
  try { userName = JSON.parse(localStorage.getItem('admin_user') || 'null')?.name || '' } catch { /* ignore */ }

  const cards = [
    { label: 'الزوار', value: stats?.unique_visitors ?? 0, sub: `النهارده: ${num(stats?.visitors_today)} · إجمالي الزيارات: ${num(stats?.visits_total)}`, icon: Users, tint: 'from-emerald-500 to-teal-600' },
    { label: 'عدد الحلول', value: stats?.attempts_total ?? 0, sub: `النهارده: ${num(stats?.attempts_today)}`, icon: FileText, tint: 'from-sky-500 to-blue-600' },
    { label: 'متوسط الدرجات', value: stats?.avg_score ?? 0, suffix: '%', sub: '', icon: Award, tint: 'from-amber-500 to-orange-600' },
    { label: 'الأسئلة', value: stats?.questions ?? 0, sub: `${num(stats?.exams)} امتحان · ${num(stats?.courses)} مادة`, icon: Database, tint: 'from-violet-500 to-purple-600' },
  ]

  return (
    <AdminLayout title={`أهلاً${userName ? ' يا ' + userName : ''} 👋`} live={connected}>
      {setupError && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm leading-relaxed">
          <b>العدّادات محتاجة تجهيز مرة واحدة:</b> افتح Supabase ← SQL Editor وشغّل ملف <code className="px-1 bg-amber-100 rounded">admin_upgrade.sql</code>، وبعدها الأرقام هتشتغل لحظيًا.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="relative overflow-hidden bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
            <div className={`absolute -top-8 -left-8 w-28 h-28 rounded-full bg-gradient-to-br ${c.tint} opacity-10`} />
            <div className="flex items-center justify-between mb-3 relative">
              <span className="text-sm font-medium text-slate-500">{c.label}</span>
              <span className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${c.tint} flex items-center justify-center shadow-lg`}>
                <c.icon className="w-5 h-5 text-white" />
              </span>
            </div>
            <div className="text-4xl font-extrabold text-slate-900 relative tabular-nums">
              {loading ? '...' : <AnimatedNumber value={Number(c.value)} suffix={c.suffix} />}
            </div>
            <div className="text-xs text-slate-500 mt-2 relative">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-900">آخر 14 يوم</h3>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> زوار</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-500" /> حلول</span>
          </div>
        </div>
        {stats?.daily ? <DailyChart data={stats.daily} /> : <div className="h-40 flex items-center justify-center text-slate-400 text-sm">{loading ? 'بيحمّل...' : 'مفيش داتا لسه'}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 font-bold text-slate-900">أكتر الامتحانات حلًا</div>
          {stats && stats.top_exams.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {stats.top_exams.map((e, i) => (
                <div key={e.id} className="px-6 py-3 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 text-sm font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-800">{e.name}</span>
                  <span className="text-xs text-slate-500">متوسط {e.avg_score ?? 0}%</span>
                  <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 text-sm font-bold tabular-nums">{num(e.attempts)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">لسه محدش حل امتحان</div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <span className="font-bold text-slate-900">آخر الحلول</span>
            <button onClick={() => navigate('/admin/exams')} className="text-xs text-emerald-700 hover:underline">كل الامتحانات</button>
          </div>
          {stats && stats.recent.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {stats.recent.map((r) => (
                <div key={r.id} className="px-6 py-3 flex items-center gap-3">
                  <span className={`w-11 text-center py-1 rounded-lg text-sm font-bold ${r.score >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{r.score}%</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-slate-800 text-sm">{r.exam_name}</div>
                    <div className="text-xs text-slate-400">{r.correct}/{r.total} صح · {formatDuration(r.time_taken)}</div>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(r.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">مفيش حلول لسه</div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
