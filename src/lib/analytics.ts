import { supabase } from './supabase'

const KEY = 'vn_visitor_id'

export function getVisitorId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2, 12)
  }
}

// One visit per browser session; the admin's own browsing is never counted.
export function trackVisit() {
  try {
    if (localStorage.getItem('admin_auth') === 'true') return
    if (sessionStorage.getItem('vn_visit_sent')) return
    sessionStorage.setItem('vn_visit_sent', '1')
  } catch { /* storage blocked: count it anyway */ }
  supabase.rpc('track_visit', { p_visitor: getVisitorId() }).then(({ error }) => {
    if (error) console.warn('track_visit failed', error.message)
  })
}

export function recordAttempt(a: { examId: string; score: number; correct: number; total: number; timeTaken: number }) {
  supabase
    .rpc('record_attempt', {
      p_exam_id: a.examId,
      p_score: a.score,
      p_correct: a.correct,
      p_total: a.total,
      p_time: a.timeTaken,
      p_visitor: getVisitorId(),
    })
    .then(({ error }) => {
      if (error) console.warn('record_attempt failed', error.message)
    })
}
