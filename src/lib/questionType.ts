export interface QuestionRow {
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
  question_type?: string | null
  order_index?: number
}

// Essay = only option A is filled (it holds the model answer) and the correct answer is A.
export function isEssay(q: Pick<QuestionRow, 'question_type' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'correct_answer'>): boolean {
  if (q.question_type === 'essay') return true
  if (q.question_type === 'mcq') return false
  return !!q.option_a && !q.option_b && !q.option_c && !q.option_d && q.correct_answer === 'A'
}
