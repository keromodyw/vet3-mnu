import { isEssay, type QuestionRow } from './questionType'

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const LETTER: Record<string, string> = { A: 'أ', B: 'ب', C: 'ج', D: 'د' }

function renderQuestion(q: QuestionRow, idx: number, withAnswers: boolean): string {
  const essay = isEssay(q)
  const img = q.image_url ? `<img class="qi" src="${esc(q.image_url)}" alt="" />` : ''
  let body = ''

  if (essay) {
    body = withAnswers
      ? `<div class="model" dir="auto">${esc(q.option_a)}</div>`
      : `<div class="lines"><div></div><div></div><div></div></div>`
  } else {
    body = (['A', 'B', 'C', 'D'] as const)
      .map((k) => {
        const text = q[`option_${k.toLowerCase()}` as 'option_a']
        if (!text) return ''
        const ok = withAnswers && q.correct_answer === k
        return `<div class="opt${ok ? ' ok' : ''}"><span class="l">${LETTER[k]}</span><span dir="auto">${esc(text)}</span></div>`
      })
      .join('')
  }

  const expl = withAnswers && q.explanation ? `<div class="ex" dir="auto">${esc(q.explanation)}</div>` : ''
  return `<div class="q"><div class="qt" dir="auto"><span class="n">${idx + 1}.</span>${esc(q.question_text)}</div>${img}${body}${expl}</div>`
}

export function printExam(examName: string, questions: QuestionRow[], withAnswers: boolean): boolean {
  const w = window.open('', '_blank')
  if (!w) return false

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${esc(examName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-size: 9.5pt; line-height: 1.5; color: #111827; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 2px solid #059669; padding-bottom: 4px; margin-bottom: 8px; }
  .head h1 { font-size: 14pt; font-weight: 800; color: #047857; }
  .head .meta { font-size: 8pt; color: #64748b; white-space: nowrap; }
  .cols { column-count: 2; column-gap: 8mm; column-rule: 1px solid #e2e8f0; }
  .q { break-inside: avoid; page-break-inside: avoid; padding-bottom: 6px; margin-bottom: 7px; border-bottom: 1px dashed #cbd5e1; }
  .qt { font-weight: 700; margin-bottom: 3px; }
  .qt .n { color: #047857; margin-inline-end: 4px; }
  .qi { display: block; max-width: 100%; max-height: 75px; margin: 2px 0 4px; border-radius: 4px; border: 1px solid #e2e8f0; }
  .opt { display: flex; align-items: baseline; gap: 6px; padding: 1px 5px; border-radius: 4px; }
  .opt .l { font-weight: 700; color: #64748b; min-width: 13px; }
  .opt.ok { background: #dcfce7; font-weight: 700; }
  .opt.ok .l { color: #15803d; }
  .opt.ok::after { content: '✓'; margin-inline-start: auto; color: #15803d; font-weight: 800; }
  .ex { font-size: 8pt; color: #64748b; margin-top: 2px; }
  .lines div { border-bottom: 1px solid #94a3b8; height: 17px; }
  .model { border: 1px solid #22c55e; background: #f0fdf4; padding: 3px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="head">
    <h1>${esc(examName)}</h1>
    <div class="meta">${questions.length} سؤال · ${withAnswers ? 'نسخة بالإجابات' : 'نسخة الطالب'} · يلا نذاكر؟</div>
  </div>
  <div class="cols">
    ${questions.map((q, i) => renderQuestion(q, i, withAnswers)).join('')}
  </div>
</body>
</html>`

  w.document.write(html)
  w.document.close()

  const go = async () => {
    try { await w.document.fonts.ready } catch { /* ignore */ }
    await Promise.all(
      Array.from(w.document.images).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = () => r(null) })
      )
    )
    w.focus()
    w.print()
  }
  if (w.document.readyState === 'complete') void go()
  else w.addEventListener('load', () => void go())
  return true
}
