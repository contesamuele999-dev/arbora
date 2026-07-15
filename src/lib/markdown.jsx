// Mini renderer markdown inline (titoli, grassetto, corsivo, code, wikilink [[...]])
// Volutamente leggero: niente dipendenze, veloce per il flusso creativo.

// ---- Formule tipo Excel: una riga che inizia con "=" viene calcolata ----
// Supporta + - * / ( ) e le potenze con ^, più alcune funzioni (sqrt, round,
// floor, ceil, abs, min, max, pow). La virgola è ammessa solo dentro le funzioni
// (es. =min(3,5)); come separatore decimale usare il punto (es. =1.5*2).
// Nessun eval arbitrario: si accettano solo cifre, operatori e i nomi funzione noti.
const FORMULA_FNS = ['sqrt', 'round', 'floor', 'ceil', 'abs', 'min', 'max', 'pow']
export function evalFormula(raw) {
  let e = (raw || '').trim()
  if (!e) return null
  e = e.replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**')
  // togliamo i nomi funzione noti, poi verifichiamo che resti solo aritmetica sicura
  const cleaned = e.replace(new RegExp('\\b(' + FORMULA_FNS.join('|') + ')\\b', 'g'), '')
  if (/[^0-9+\-*/().,%\s]/.test(cleaned)) return null
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...FORMULA_FNS, 'return (' + e + ')')
    const r = fn(Math.sqrt, Math.round, Math.floor, Math.ceil, Math.abs, Math.min, Math.max, Math.pow)
    if (typeof r === 'number' && isFinite(r)) return Math.round(r * 1e10) / 1e10
  } catch { /* espressione non valida */ }
  return null
}

export function renderInline(text) {
  // gestisce **bold**, *italic*, `code`, ((collegamento)) e [[collegamento]]
  const parts = []
  let i = 0
  const regex = /(\*\*[^*]+\*\*|\^\^[^^]+\^\^|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|\(\([^)]+\)\))/g
  let last = 0, m
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('^^')) parts.push(<span key={i++} className="smallcaps">{tok.slice(2, -2)}</span>)
    else if (tok.startsWith('*')) parts.push(<em key={i++}>{tok.slice(1, -1)}</em>)
    else if (tok.startsWith('`')) parts.push(<code key={i++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[[') || tok.startsWith('((')) {
      const name = tok.slice(2, -2)
      parts.push(<span key={i++} className="wikilink" data-link={name}>{name}</span>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function RenderedBlock({ text, onWikilink }) {
  const t = text || ''
  const click = (e) => {
    const link = e.target.getAttribute?.('data-link')
    if (link && onWikilink) { e.stopPropagation(); onWikilink(link) }
  }
  if (t.startsWith('=') && t.length > 1) {
    const res = evalFormula(t.slice(1))
    if (res !== null) return (
      <div onClick={click} className="formula-block">
        <span className="formula-expr">{t}</span>
        <span className="formula-eq"> = </span>
        <b className="formula-res">{res}</b>
      </div>
    )
    // non calcolabile: mostra il testo così com'è
  }
  if (t.startsWith('### ')) return <h3 onClick={click}>{renderInline(t.slice(4))}</h3>
  if (t.startsWith('## ')) return <h2 onClick={click}>{renderInline(t.slice(3))}</h2>
  if (t.startsWith('# ')) return <h1 onClick={click}>{renderInline(t.slice(2))}</h1>
  if (t.trim() === '---') return <div className="divider-block" />
  if (/^\s*[-*]\s/.test(t)) return <div onClick={click}>• {renderInline(t.replace(/^\s*[-*]\s/, ''))}</div>
  if (/^\s*\d+\.\s/.test(t)) {
    const n = t.match(/^\s*(\d+)\./)[1]
    return <div onClick={click}>{n}. {renderInline(t.replace(/^\s*\d+\.\s/, ''))}</div>
  }
  return <div onClick={click}>{renderInline(t) }</div>
}
