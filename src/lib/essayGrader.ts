/**
 * Essay grading engine — ported 1:1 from the original project (Code.gs):
 *   evaluateEssayAnswer / cleanTextForComparison / calculateAdvancedSimilarity
 *   + getFeedbackText from Index.html
 * The logic, thresholds (>= 0.4 = correct) and messages are unchanged.
 */

export const ESSAY_PASS_SCORE = 0.4

export interface EssayResult {
  isCorrect: boolean
  score: number // 0..1
  feedback: string
  similarity: number // 0..100
  modelAnswer?: string
}

export function cleanTextForComparison(text: string): string {
  return text ? text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"?]/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

export function calculateAdvancedSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 1
  const w1 = text1.split(' ').filter((w) => w.length > 0)
  const w2 = text2.split(' ').filter((w) => w.length > 0)
  if (w1.length === 0 || w2.length === 0) return 0
  let m = 0
  w1.forEach((w) => {
    if (w2.indexOf(w) !== -1) m++
  })
  return m / Math.max(w1.length, w2.length)
}

export function evaluateEssayAnswer(userAnswer: string, correctAnswer: string): EssayResult {
  try {
    if (!userAnswer || userAnswer.trim() === '') return { isCorrect: false, score: 0, feedback: 'لم تكتب إجابة', similarity: 0 }
    const cu = cleanTextForComparison(userAnswer)
    const cc = cleanTextForComparison(correctAnswer)
    if (cu === cc) return { isCorrect: true, score: 1, feedback: 'إجابة صحيحة تماماً!', similarity: 100, modelAnswer: correctAnswer }
    const sim = calculateAdvancedSimilarity(cu, cc)
    const pct = Math.round(sim * 100)
    return {
      isCorrect: sim >= ESSAY_PASS_SCORE,
      score: sim,
      feedback: (sim >= ESSAY_PASS_SCORE ? 'إجابة صحيحة (' : 'إجابة غير صحيحة (') + pct + '%)',
      similarity: pct,
      modelAnswer: correctAnswer,
    }
  } catch {
    return { isCorrect: false, score: 0, feedback: 'حدث خطأ', similarity: 0 }
  }
}

export function getFeedbackText(score: number): string {
  if (score >= 0.9) return 'إجابة ممتازة!'
  if (score >= 0.75) return 'إجابة جيدة جداً!'
  if (score >= 0.6) return 'إجابة جيدة!'
  if (score >= 0.5) return 'إجابة مقبولة!'
  if (score >= 0.4) return 'إجابة صحيحة مع أخطاء بسيطة'
  if (score >= 0.3) return 'حاول مرة أخرى، الإجابة قريبة'
  return 'تحتاج للمراجعة'
}
