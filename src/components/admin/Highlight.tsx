import { highlightWords } from '../../lib/search'

export default function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>
  return (
    <>
      {highlightWords(text, tokens).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-amber-200 text-slate-900 rounded px-0.5">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}
