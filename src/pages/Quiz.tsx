import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronRight, ChevronLeft, Flag, X, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { shuffleArray } from '../utils/helpers'

interface Question {
  id: string
  exam_id: string
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation: string | null
  image_url: string | null
}

interface ShuffledOption {
  key: 'A' | 'B' | 'C' | 'D'
  text: string
  originalKey: 'A' | 'B' | 'C' | 'D'
}

interface ShuffledQuestion extends Question {
  shuffledOptions: ShuffledOption[]
  correctAnswerInShuffled: 'A' | 'B' | 'C' | 'D'
}

const correctMessages = ['أحسنت!', 'ممتاز!', 'رائع!', 'إجابة صحيحة!', 'بارك الله فيك!']
const wrongMessages = ['للأسف خاطئ', 'حاول مرة أخرى', 'راجع الشرح', 'خطأ - تعلم منه']

export default function Quiz() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<ShuffledQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({})
  const [loading, setLoading] = useState(true)
  const [examName, setExamName] = useState('')
  const [showModeModal, setShowModeModal] = useState(true)
  const [examMode, setExamMode] = useState<'instant' | 'exam'>('instant')
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState({ correct: false, message: '' })
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const [startTime, setStartTime] = useState<number>(Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  useEffect(() => {
    fetchQuestions()
  }, [examId])

  useEffect(() => {
    if (!showModeModal) {
      const now = Date.now()
      setStartTime(now)
      const timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - now) / 1000))
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [showModeModal])

  const fetchQuestions = async () => {
    try {
      const { data: exam } = await supabase
        .from('exams')
        .select('name')
        .eq('id', examId)
        .single()
      
      if (exam) setExamName(exam.name)

      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('exam_id', examId)
      
      if (error) throw error

      // Shuffle questions order
      const shuffledQuestionsList = shuffleArray(data || [])

      const processedQuestions: ShuffledQuestion[] = shuffledQuestionsList.map((q: Question) => {
        const optionsPool: Array<{ originalKey: 'A' | 'B' | 'C' | 'D', text: string }> = []
        if (q.option_a) optionsPool.push({ originalKey: 'A', text: q.option_a })
        if (q.option_b) optionsPool.push({ originalKey: 'B', text: q.option_b })
        if (q.option_c) optionsPool.push({ originalKey: 'C', text: q.option_c })
        if (q.option_d) optionsPool.push({ originalKey: 'D', text: q.option_d })

        // Shuffle choices
        const shuffledPool = shuffleArray(optionsPool)
        const shuffledOptions: ShuffledOption[] = shuffledPool.map((opt, idx) => ({
          key: String.fromCharCode(65 + idx) as 'A' | 'B' | 'C' | 'D',
          text: opt.text,
          originalKey: opt.originalKey
        }))

        // Find which shuffled letter is the correct one
        const correctInShuffled = shuffledOptions.find(
          (so) => so.originalKey === q.correct_answer
        )?.key as 'A' | 'B' | 'C' | 'D'

        return {
          ...q,
          shuffledOptions,
          correctAnswerInShuffled: correctInShuffled || q.correct_answer
        }
      })

      setQuestions(processedQuestions)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const currentQuestion = questions[currentIndex]
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0

  const handleAnswer = (shuffledKey: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQuestion) return
    if (examMode === 'instant' && answered[currentQuestion.id]) return
    
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: shuffledKey
    }))
    
    if (examMode === 'instant') {
      setAnswered(prev => ({ ...prev, [currentQuestion.id]: true }))
      const isCorrect = shuffledKey === currentQuestion.correctAnswerInShuffled
      setFeedback({
        correct: isCorrect,
        message: isCorrect ? correctMessages[Math.floor(Math.random() * correctMessages.length)] : wrongMessages[Math.floor(Math.random() * wrongMessages.length)]
      })
      setShowFeedback(true)
      setTimeout(() => setShowFeedback(false), 2000)
    }
  }

  const toggleFlag = () => {
    if (!currentQuestion) return
    setFlaggedQuestions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(currentQuestion.id)) {
        newSet.delete(currentQuestion.id)
      } else {
        newSet.add(currentQuestion.id)
      }
      return newSet
    })
  }

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }



  const finishQuiz = () => {
    const timeTaken = Math.floor((Date.now() - startTime) / 1000)
    let correct = 0
    const answerDetails = questions.map(q => {
      const userAnswerShuffled = answers[q.id] || null
      const isCorrect = userAnswerShuffled === q.correctAnswerInShuffled
      if (isCorrect) correct++
      // Find original key for results display
      const userAnswerOriginal = userAnswerShuffled 
        ? q.shuffledOptions.find(so => so.key === userAnswerShuffled)?.originalKey || null
        : null
      return { 
        questionId: q.id, 
        userAnswer: userAnswerOriginal, 
        correctAnswer: q.correct_answer, 
        isCorrect 
      }
    })

    const result = {
      totalQuestions: questions.length,
      correctAnswers: correct,
      wrongAnswers: questions.length - correct,
      score: Math.round((correct / questions.length) * 100),
      answers: answerDetails,
      examName,
      timeTaken
    }

    navigate('/results', { state: { result, questions } })
  }

  if (showModeModal) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-center">
            <h1 className="text-2xl font-bold text-white mb-2">{examName}</h1>
            <p className="text-emerald-50">اختار المود اللي تحب تدرب بيه</p>
          </div>
          <div className="p-6 space-y-3">
            <button
              onClick={() => { setExamMode('instant'); setShowModeModal(false) }}
              className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-right"
            >
              <h3 className="font-bold text-slate-900 mb-1">إجابات مباشرة</h3>
              <p className="text-sm text-slate-600">الإجابة بتاعت السؤال و شرح السؤال هيظهروا مباشرةً بعد ما تختار إجابة</p>
            </button>
            <button
              onClick={() => { setExamMode('exam'); setShowModeModal(false) }}
              className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-right"
            >
              <h3 className="font-bold text-slate-900 mb-1">نظام الامتحان</h3>
              <p className="text-sm text-slate-600">هيسيبك تحل براحتك خالص زي الامتحان الفعلي بالظبط و يقولك الصح و الغلط و الشرح في الآخر</p>
            </button>
            <button onClick={() => navigate('/')} className="w-full py-2 text-slate-600 hover:text-slate-900">
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">جاري تحميل الأسئلة...</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md w-full">
          <h2 className="text-xl font-bold text-slate-900 mb-2">لا توجد أسئلة</h2>
          <p className="text-slate-600 mb-6">لم يتم إضافة أسئلة لهذا الامتحان بعد</p>
          <button onClick={() => navigate('/')} className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium">
            العودة للرئيسية
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Feedback Toast */}
      {showFeedback && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl animate-bounce ${feedback.correct ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <span className="font-bold">{feedback.message}</span>
        </div>
      )}

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-slate-200/60">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4 rotate-180" />
              <span className="text-sm">خروج</span>
            </button>
            <div className="text-center flex-1">
              <h1 className="font-semibold text-slate-900 text-sm truncate px-4">{examName}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-slate-600 text-sm">
                <Clock className="w-4 h-4" />
                <span>{Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}</span>
              </div>
              <button onClick={toggleFlag} className={`p-2 rounded-lg ${flaggedQuestions.has(currentQuestion.id) ? 'bg-orange-100 text-orange-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Flag className="w-4 h-4" />
              </button>
              <div className="text-sm text-slate-600 font-medium">
                {currentIndex + 1} / {questions.length}
              </div>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-600 to-teal-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-6">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          <div className="mb-6">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
              السؤال {currentIndex + 1}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-relaxed">
              {currentQuestion.question_text}
            </h2>
            {currentQuestion.image_url && (
              <img 
                src={currentQuestion.image_url} 
                alt="Question" 
                className="mt-4 max-w-full h-auto rounded-xl border border-slate-200"
              />
            )}
          </div>

          <div className="space-y-3">
            {currentQuestion.shuffledOptions.map((option) => {
              const isSelected = answers[currentQuestion.id] === option.originalKey
              const showResult = examMode === 'instant' && answered[currentQuestion.id]
              const isCorrectOption = option.originalKey === currentQuestion.correct_answer
              return (
                <button
                  key={option.key}
                  onClick={() => handleAnswer(option.originalKey)}
                  disabled={examMode === 'instant' && answered[currentQuestion.id]}
                  className={`w-full text-right p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                    showResult && isCorrectOption
                      ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/10'
                      : showResult && isSelected && !isCorrectOption
                      ? 'border-red-500 bg-red-50'
                      : isSelected && !showResult
                      ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 disabled:cursor-not-allowed'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                    showResult && isCorrectOption ? 'bg-emerald-600 text-white' :
                    showResult && isSelected && !isCorrectOption ? 'bg-red-600 text-white' :
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {option.key}
                  </div>
                  <span className={`flex-1 text-base sm:text-lg ${
                    showResult && isCorrectOption ? 'text-emerald-900 font-medium' :
                    showResult && isSelected && !isCorrectOption ? 'text-red-900' :
                    isSelected ? 'text-emerald-900 font-medium' : 'text-slate-900'
                  }`}>
                    {option.text}
                  </span>
                  {showResult && isCorrectOption && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  {showResult && isSelected && !isCorrectOption && <X className="w-5 h-5 text-red-600" />}
                </button>
              )
            })}
          </div>

          {examMode === 'instant' && answered[currentQuestion.id] && currentQuestion.explanation && (
            <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-sm font-semibold text-blue-900 mb-1">شرح الإجابة:</p>
              <p className="text-sm text-blue-800">{currentQuestion.explanation}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6 gap-4">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
            السابق
          </button>
          
          {currentIndex === questions.length - 1 ? (
            <button
              onClick={finishQuiz}
              disabled={examMode === 'exam' ? Object.keys(answers).length === 0 : Object.keys(answers).length === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
            >
              إنهاء الامتحان
              <CheckCircle2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={examMode === 'instant' ? !answered[currentQuestion.id] && !answers[currentQuestion.id] : !answers[currentQuestion.id]}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
            >
              التالي
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
