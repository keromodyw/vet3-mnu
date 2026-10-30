import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Upload, FileSpreadsheet, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

export default function AdminImport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [exams, setExams] = useState<any[]>([])
  const [selectedExam, setSelectedExam] = useState('')

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth')
    if (auth !== 'true') {
      navigate('/admin/login')
      return
    }
    fetchExams()
    const examIdFromUrl = searchParams.get('examId')
    if (examIdFromUrl) {
      setSelectedExam(examIdFromUrl)
    }
  }, [])

  const fetchExams = async () => {
    const { data } = await supabase.from('exams').select('*').order('name')
    setExams(data || [])
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['ID', 'السؤال', 'أ', 'ب', 'ج', 'د', 'الإجابة الصحيحة', 'الشرح', 'رابط الصورة'],
      ['', 'مثال: ما عاصمة مصر؟', 'القاهرة', 'الإسكندرية', 'الجيزة', 'أسوان', 'A', 'القاهرة عاصمة جمهورية مصر العربية', '']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'أسئلة')
    XLSX.writeFile(wb, 'Yalla_Nezaker_Template.xlsx')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedExam) {
      alert('يرجى اختيار الامتحان أولاً')
      return
    }

    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      const questions = []
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row || !row[1]) continue
        
        questions.push({
          exam_id: selectedExam,
          question_text: row[1].toString().trim(),
          option_a: row[2] ? row[2].toString().trim() : null,
          option_b: row[3] ? row[3].toString().trim() : null,
          option_c: row[4] ? row[4].toString().trim() : null,
          option_d: row[5] ? row[5].toString().trim() : null,
          correct_answer: (row[6] || 'A').toString().trim().toUpperCase(),
          explanation: row[7] ? row[7].toString().trim() : null,
          image_url: row[8] ? row[8].toString().trim() : null,
          order_index: questions.length
        })
      }

      if (questions.length === 0) {
        alert('لم يتم العثور على أسئلة صالحة في الملف')
        setLoading(false)
        return
      }

      const { error } = await supabase.from('questions').insert(questions)
      if (error) throw error

      alert(`تم استيراد ${questions.length} سؤال بنجاح`)
      navigate(`/admin/exams/${selectedExam}/questions`)
    } catch (error) {
      console.error('Error:', error)
      alert('حدث خطأ أثناء الاستيراد')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">استيراد الأسئلة من ملف Excel</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">اختر الامتحان *</label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">-- اختر امتحان --</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>{exam.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
              <Download className="w-5 h-5" />
              تحميل قالب Excel جاهز
            </button>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">رفع ملف Excel</h3>
            <p className="text-sm text-slate-600 mb-6">يدعم ملفات .xlsx و .xls</p>
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl cursor-pointer hover:shadow-lg">
              <Upload className="w-5 h-5" />
              {loading ? 'جاري الاستيراد...' : 'اختيار الملف ورفع'}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={loading || !selectedExam}
                className="hidden"
              />
            </label>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-900 font-medium mb-2">ترتيب الأعمدة:</p>
            <p className="text-xs text-blue-800 leading-relaxed">A: ID (اختياري) | B: نص السؤال | C: أ | D: ب | E: ج | F: د | G: الإجابة الصحيحة (A/B/C/D) | H: شرح الإجابة | I: رابط صورة</p>
          </div>
        </div>
      </main>
    </div>
  )
}
