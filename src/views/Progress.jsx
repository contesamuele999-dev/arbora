import { useCallback, useEffect, useRef, useState } from 'react'
import { STAGES, stageOf } from '../lib/stages.js'

// ============================================================
// PROGRESS — bacheca kanban. Drag pointer-based (funziona anche
// su touch): la colonna sotto il dito si illumina, ai bordi la
// bacheca scorre da sola. Tocco sul pallino = scelta fase rapida.
// ============================================================
const EDGE = 60          // zona vicino al bordo che attiva l'auto-scroll
const SCROLL_SPEED = 14

export default function Progress({ viste, onOpen, onSetStage }) {
  const [pick, setPick] = useState(null)      // vista di cui cambiare fase (menu)
  const [drag, setDrag] = useState(null)      // { id, x, y, over }
  const [query, setQuery] = useState('')
  const dragRef = useRef(null)
  const kanbanRef = useRef(null)
  const autoScroll = useRef(0)                 // -1 sx, 1 dx, 0 fermo
  const q = query.trim().toLowerCase()
  const matches = (v) => {
    if (!q) return true
    if ((v.titolo || '').toLowerCase().includes(q)) return true
    return (v.blocchi || []).map(b => b.text).join(' ').toLowerCase().includes(q)
  }
  const items = viste.filter(v => !v.is_template && matches(v))
  // valori più recenti letti dentro gli handler di drag (che sono stabili)
  const latest = useRef({ items, onOpen, onSetStage })
  latest.current = { items, onOpen, onSetStage }

  // Auto-scroll orizzontale continuo mentre si trascina vicino ai bordi.
  useEffect(() => {
    if (!drag) { autoScroll.current = 0; return }
    let raf
    const step = () => {
      const el = kanbanRef.current
      if (el && autoScroll.current) el.scrollLeft += autoScroll.current * SCROLL_SPEED
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [drag])

  const stageUnder = (x, y) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest?.('.kcol')?.getAttribute('data-stage') || null
  }

  // Drag basato su listener a livello WINDOW: più affidabile del pointer-capture,
  // che a volte si perdeva (ri-render della card, elementi figli, ecc.) e faceva
  // "saltare" il trascinamento. I listener si tolgono al rilascio.
  const onCardMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return
    d.moved = true
    // auto-scroll ai bordi della bacheca
    const el = kanbanRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (e.clientX < r.left + EDGE) autoScroll.current = -1
      else if (e.clientX > r.right - EDGE) autoScroll.current = 1
      else autoScroll.current = 0
    }
    d.over = stageUnder(e.clientX, e.clientY)
    setDrag({ id: d.id, x: e.clientX, y: e.clientY, over: d.over })
  }, [])
  const onCardUp = useCallback(() => {
    window.removeEventListener('pointermove', onCardMove)
    window.removeEventListener('pointerup', onCardUp)
    const d = dragRef.current; dragRef.current = null
    setDrag(null); autoScroll.current = 0
    if (!d) return
    const { items: its, onOpen: open, onSetStage: setStage } = latest.current
    if (!d.moved) { const v = its.find(x => x.id === d.id); if (v) open(v); return }
    if (d.over) setStage(d.id, d.over)
  }, [onCardMove])
  const onCardDown = (e, id) => {
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, moved: false, over: null }
    window.addEventListener('pointermove', onCardMove)
    window.addEventListener('pointerup', onCardUp)
  }
  // pulizia di sicurezza: se il componente si smonta durante un drag, togli i listener
  useEffect(() => () => {
    window.removeEventListener('pointermove', onCardMove)
    window.removeEventListener('pointerup', onCardUp)
  }, [onCardMove, onCardUp])

  return (
    <div className="progress-wrap">
      <div className="section-head">
        <h2>Progress</h2>
        <span className="crumb">{items.length} viste nel flusso</span>
      </div>

      <div className="pipe-search">
        <span className="pipe-search-ico">🔍</span>
        <input className="pipe-search-input" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Cerca viste (titolo, poi contenuto)…" />
        {query && <button className="pipe-search-clear" title="Pulisci" onClick={() => setQuery('')}>✕</button>}
      </div>

      <div className="kanban" data-noswipe="scroll" ref={kanbanRef}>
        {STAGES.map(s => {
          const col = items.filter(v => stageOf(v).id === s.id)
          return (
            <div key={s.id} data-stage={s.id}
              className={'kcol' + (drag?.over === s.id ? ' kcol-over' : '')}
              style={{ '--stage': s.color }}>
              <div className="kcol-head">
                <span className="stage-dot" />
                <span>{s.label}</span>
                <span className="kcount">{col.length}</span>
              </div>
              <div className="kcol-body">
                {col.map(v => (
                  <div key={v.id} className={'kcard' + (drag?.id === v.id ? ' kcard-drag' : '')} style={{ '--stage': s.color }}
                    onPointerDown={e => onCardDown(e, v.id)}>
                    <button className="stage-dot as-btn" title="Cambia fase"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setPick(v) }} />
                    <span className="kcard-title">{v.titolo || 'Senza titolo'}</span>
                  </div>
                ))}
                {!col.length && <div className="kempty">—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {drag && (
        <div className="kanban-hint">Rilascia su una colonna per cambiare fase</div>
      )}
      {drag && drag.x != null && (
        <div className="drag-ghost" style={{ left: drag.x + 14, top: drag.y + 10 }}>
          {items.find(v => v.id === drag.id)?.titolo || 'Vista'}
        </div>
      )}

      {pick && (
        <div className="modal-bg" onClick={() => setPick(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Fase di "{pick.titolo || 'Senza titolo'}"</h3>
            <div className="stage-list">
              {STAGES.map(s => (
                <button key={s.id} className={'stage-opt' + (stageOf(pick).id === s.id ? ' active' : '')}
                  style={{ '--stage': s.color }}
                  onClick={() => { onSetStage(pick.id, s.id); setPick(null) }}>
                  <span className="stage-dot" /> {s.label}
                </button>
              ))}
            </div>
            <div className="row"><button className="btn ghost" onClick={() => setPick(null)}>Annulla</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
