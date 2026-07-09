import { useMemo, useState } from 'react'
import { stageOf } from '../lib/stages.js'

// ============================================================
// PIPE — visioni (contenitori, sfondo tinto col loro colore)
// e viste (card neutre con indicatore colore della fase).
// Ricerca: priorità ai titoli delle viste, poi al contenuto.
// ============================================================
export default function Pipeline({ visioni, viste, onOpen, onPreview, onAddVisione, onAddVista, onRenameVisione, onRecolorVisione, onDeleteVista, onDeleteVisione, onReorderVisioni, onMoveVistaToVisione }) {
  const [query, setQuery] = useState('')
  const [dragVisId, setDragVisId] = useState(null)
  const [overVisId, setOverVisId] = useState(null)          // visione target per lo spostamento di una VISTA (evidenzia il contenitore)
  const [reorderOver, setReorderOver] = useState(null)       // { id, edge } per il riordino VISIONI (mostra una riga separatrice)
  const [dragVistaId, setDragVistaId] = useState(null)   // vista trascinata verso un'altra visione
  const preview = (v) => (v.blocchi || []).map(b => b.text).join(' ').replace(/[#*`>]/g, '').slice(0, 140)

  const q = query.trim().toLowerCase()
  // punteggio: 2 = match nel titolo (priorità), 1 = solo nel contenuto, 0 = nessun match
  const scoreVista = (v) => {
    if (!q) return 1
    if ((v.titolo || '').toLowerCase().includes(q)) return 2
    const content = (v.blocchi || []).map(b => b.text).join(' ').toLowerCase()
    return content.includes(q) ? 1 : 0
  }

  // per ogni visione: viste filtrate e ordinate (titolo prima del contenuto)
  const sezioni = useMemo(() => {
    return visioni.map(vis => {
      const mie = viste.filter(v => v.visione_id === vis.id)
      const visMatch = q && (vis.titolo || '').toLowerCase().includes(q)
      let list = mie.map(v => ({ v, s: scoreVista(v) }))
      if (q) list = list.filter(x => x.s > 0 || visMatch)
      list.sort((a, b) => b.s - a.s)
      return { vis, mie, list, visMatch, total: mie.length }
    }).filter(sez => !q || sez.list.length > 0 || sez.visMatch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visioni, viste, q])

  const nResults = sezioni.reduce((n, s) => n + s.list.length, 0)

  return (
    <div className="pipe">
      <div className="section-head">
        <h2>Pipe</h2>
        <span className="crumb">{visioni.length} visioni · {viste.length} viste</span>
        <div className="spacer" />
        <button className="add-btn" onClick={onAddVisione}>＋ Nuova visione</button>
      </div>

      <div className="pipe-search">
        <span className="pipe-search-ico">🔍</span>
        <input className="pipe-search-input" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Cerca viste (titolo, poi contenuto)…" />
        {query && <button className="pipe-search-clear" title="Pulisci" onClick={() => setQuery('')}>✕</button>}
      </div>

      {sezioni.map(({ vis, list, total }) => (
        <section key={vis.id}
          className={'vision-block'
            + (dragVisId === vis.id ? ' dragging' : '')
            + (overVisId === vis.id && dragVistaId && vis.id !== viste.find(v => v.id === dragVistaId)?.visione_id ? ' drop-target' : '')
            + (reorderOver?.id === vis.id && dragVisId && dragVisId !== vis.id ? ' drop-line-' + reorderOver.edge : '')}
          style={{ '--vcol': vis.colore || 'var(--green)' }}
          onDragOver={e => {
            if (q) return
            if (dragVisId) {
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const edge = (e.clientY - r.top) < r.height / 2 ? 'before' : 'after'
              setReorderOver({ id: vis.id, edge })
            } else if (dragVistaId) {
              e.preventDefault(); setOverVisId(vis.id)
            }
          }}
          onDragLeave={() => { setOverVisId(id => id === vis.id ? null : id); setReorderOver(o => o?.id === vis.id ? null : o) }}
          onDrop={e => {
            e.preventDefault()
            if (!q && dragVisId && dragVisId !== vis.id) onReorderVisioni(dragVisId, vis.id, reorderOver?.edge || 'before')
            else if (!q && dragVistaId) {
              const v = viste.find(x => x.id === dragVistaId)
              if (v && v.visione_id !== vis.id) onMoveVistaToVisione?.(dragVistaId, vis.id)
            }
            setDragVisId(null); setDragVistaId(null); setOverVisId(null); setReorderOver(null)
          }}>
          <header className="vision-head">
            {!q && (
              <span className="drag-handle" title="Trascina per riordinare"
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragVisId(vis.id) }}
                onDragEnd={() => { setDragVisId(null); setReorderOver(null) }}>⠿</span>
            )}
            <label className="vision-swatch" title="Colore della visione">
              <input type="color" value={vis.colore || '#2e9e63'}
                onChange={e => onRecolorVisione(vis, e.target.value)} />
            </label>
            <h3>{vis.titolo}</h3>
            <button className="iconbtn mini" title="Rinomina" onClick={() => onRenameVisione(vis)}>✎</button>
            <button className="iconbtn mini danger" title="Elimina visione (e tutte le sue viste)" onClick={() => onDeleteVisione(vis)}>🗑</button>
            <div className="spacer" />
            <span className="crumb">{q ? `${list.length}/${total}` : total} viste</span>
            <button className="add-btn mini" onClick={() => onAddVista(vis.id)}>＋ Vista</button>
          </header>

          <div className="vista-grid">
            {list.map(({ v }) => {
              const st = stageOf(v)
              return (
                <article key={v.id} className={'vista-card' + (dragVistaId === v.id ? ' dragging' : '')} style={{ '--stage': st.color }}
                  draggable title="Trascina su un'altra visione per spostarla"
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragVistaId(v.id) }}
                  onDragEnd={() => { setDragVistaId(null); setOverVisId(null) }}
                  onClick={() => onOpen(v)}>
                  <div className="vista-top">
                    <span className="stage-dot" title={st.label} />
                    <h4>{v.titolo || 'Senza titolo'}</h4>
                    <button className="iconbtn mini" title="Anteprima"
                      onClick={e => { e.stopPropagation(); onPreview(v) }}>👁</button>
                    <button className="iconbtn mini danger" title="Elimina vista"
                      onClick={e => { e.stopPropagation(); onDeleteVista(v) }}>🗑</button>
                  </div>
                  <p className="vista-preview">{preview(v) || 'Vuota…'}</p>
                </article>
              )
            })}
            {!list.length && <div className="vista-empty">{q ? 'Nessuna vista corrisponde qui.' : 'Nessuna vista: aggiungine una.'}</div>}
          </div>
        </section>
      ))}

      {q && nResults === 0 && !sezioni.length && (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>
          Nessun risultato per “{query}”.
        </div>
      )}

      {!visioni.length && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          Crea la tua prima visione per iniziare.
        </div>
      )}
    </div>
  )
}
