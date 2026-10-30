import { useNavigate } from 'react-router-dom'
import { Folder, FileText, Settings2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLive } from '../../lib/live'
import AdminLayout from '../../components/admin/AdminLayout'

interface Course { id: string; name: string; image_url: string | null }

export default function AdminExamsList() {
  const navigate = useNavigate()
  const { data, loading, connected } = useLive(
    async () => {
      const [c, e] = await Promise.all([
        supabase.from('courses').select('*').order('name'),
        supabase.from('exams').select('id,course_id'),
      ])
      if (c.error) throw c.error
      const counts: Record<string, number> = {}
      ;(e.data || []).forEach((x: any) => { if (x.course_id) counts[x.course_id] = (counts[x.course_id] || 0) + 1 })
      return { courses: (c.data || []) as Course[], counts }
    },
    ['courses', 'exams']
  )

  const courses = data?.courses || []

  return (
    <AdminLayout
      title="المواد والامتحانات"
     
      live={connected}
      actions={
        <button onClick={() => navigate('/admin/courses')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium shadow-lg shadow-emerald-600/20">
          <Settings2 className="w-4 h-4" />
          تعديل المواد
        </button>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-52 rounded-3xl bg-slate-200/60 animate-pulse" />)}
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
          <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-4">مفيش مواد لسه</p>
          <button onClick={() => navigate('/admin/courses')} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl">ضيف أول مادة</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => navigate(`/admin/courses/${course.id}/exams`)}
              className="group bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-emerald-300 transition-all text-start"
            >
              {course.image_url ? (
                <img src={course.image_url} alt={course.name} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                  <Folder className="w-10 h-10 text-emerald-700/70" />
                </div>
              )}
              <div className="p-5 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900 truncate">{course.name}</h3>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm whitespace-nowrap group-hover:bg-emerald-50 group-hover:text-emerald-700">
                  <FileText className="w-3.5 h-3.5" />
                  {data?.counts[course.id] || 0} امتحان
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
