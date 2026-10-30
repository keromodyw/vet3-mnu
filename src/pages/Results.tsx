import { useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Home, RotateCcw, Clock } from 'lucide-react'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const { result, questions } = location.state || {}

  if (!result) {
    navigate('/')
    return null
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins} دقيقة ${secs} ثانية`
  }

  return (
    <div className="min-h-screen pb-12">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800" />
        <div className="relative max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">نتيجة الامتحان</h1>
          <p className="text-emerald-50 text-lg">{result.examName}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 -mt-8">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 mb-6 text-center">
          <div className="text-6xl font-bold text-emerald-600 mb-2">{result.score}%</div>
          <p className="text-slate-600 mb-6">الدرجة النهائية</p>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto mb-4">
            <div className="p-4 rounded-xl bg-emerald-50">
              <div className="text-2xl font-bold text-emerald-700">{result.correctAnswers}</div>
              <div className="text-sm text-emerald-600">صحيح</div>
            </div>
            <div className="p-4 rounded-xl bg-red-50">
              <div className="text-2xl font-bold text-red-700">{result.wrongAnswers}</div>
              <div className="text-sm text-red-600">خطأ</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50">
              <div className="text-2xl font-bold text-slate-700">{result.totalQuestions}</div>
              <div className="text-sm text-slate-600">الإجمالي</div>
            </div>
            <div className="p-4 rounded-xl bg-blue-50">
              <div className="flex items-center justify-center gap-1 text-blue-700 mb-1">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-blue-700">{result.timeTaken ? formatTime(result.timeTaken) : '-'}</div>
              <div className="text-xs text-blue-600">وقت الحل</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <button onClick={() => navigate('/')} className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium flex items-center justify-center gap-2">
            <Home className="w-5 h-5" />
            العودة للرئيسية
          </button>
          <button onClick={() => navigate(-2)} className="flex-1 py-3 px-6 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-medium flex items-center justify-center gap-2">
            <RotateCcw className="w-5 h-5" />
            إعادة الامتحان
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">مراجعة الإجابات</h2>
          <div className="space-y-6">
            {questions.map((q: any, idx: number) => {
              const answer = result.answers.find((a: any) => a.questionId === q.id)
              return (
                <div key={q.id} className="pb-6 border-b border-slate-200 last:border-0 last:pb-0">
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      answer?.isCorrect ? 'bg-emerald-100' : 'bg-red-100'
                    }`}>
                      {answer?.isCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-slate-900">السؤال {idx + 1}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          answer?.isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {answer?.isCorrect ? 'صحيح' : 'خطأ'}
                        </span>
                      </div>
                      <p className="text-slate-900 mb-4">{q.question_text}</p>
                      
                      <div className="space-y-2">
                        {q.option_a && (
                          <div className={`p-3 rounded-xl border-2 ${
                            q.correct_answer === 'A' ? 'border-emerald-500 bg-emerald-50' :
                            answer?.userAnswer === 'A' && !answer?.isCorrect ? 'border-red-500 bg-red-50' :
                            'border-slate-200'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">أ</span>
                              <span>{q.option_a}</span>
                              {q.correct_answer === 'A' && <span className="text-xs text-emerald-700 mr-auto">الإجابة الصحيحة</span>}
                            </div>
                          </div>
                        )}
                        {q.option_b && (
                          <div className={`p-3 rounded-xl border-2 ${
                            q.correct_answer === 'B' ? 'border-emerald-500 bg-emerald-50' :
                            answer?.userAnswer === 'B' && !answer?.isCorrect ? 'border-red-500 bg-red-50' :
                            'border-slate-200'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">ب</span>
                              <span>{q.option_b}</span>
                              {q.correct_answer === 'B' && <span className="text-xs text-emerald-700 mr-auto">الإجابة الصحيحة</span>}
                            </div>
                          </div>
                        )}
                        {q.option_c && (
                          <div className={`p-3 rounded-xl border-2 ${
                            q.correct_answer === 'C' ? 'border-emerald-500 bg-emerald-50' :
                            answer?.userAnswer === 'C' && !answer?.isCorrect ? 'border-red-500 bg-red-50' :
                            'border-slate-200'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">ج</span>
                              <span>{q.option_c}</span>
                              {q.correct_answer === 'C' && <span className="text-xs text-emerald-700 mr-auto">الإجابة الصحيحة</span>}
                            </div>
                          </div>
                        )}
                        {q.option_d && (
                          <div className={`p-3 rounded-xl border-2 ${
                            q.correct_answer === 'D' ? 'border-emerald-500 bg-emerald-50' :
                            answer?.userAnswer === 'D' && !answer?.isCorrect ? 'border-red-500 bg-red-50' :
                            'border-slate-200'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="font-bold">د</span>
                              <span>{q.option_d}</span>
                              {q.correct_answer === 'D' && <span className="text-xs text-emerald-700 mr-auto">الإجابة الصحيحة</span>}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {q.explanation && (
                        <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                          <p className="text-sm font-semibold text-blue-900 mb-1">شرح الإجابة:</p>
                          <p className="text-sm text-blue-800">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
