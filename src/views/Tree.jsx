import { useMemo, useRef, useState } from 'react'
import { stageOf } from '../lib/stages.js'

// ============================================================
// TREE — albero unico delle viste, stile XMind "tree chart":
// radice in alto a sinistra, figli impilati sotto e indentati
// a destra, connettori a gomito arrotondati.
// Lo sfondo dei nodi sbiadisce con la distanza dalla radice.
// Scroll nativo (niente pan custom) + zoom con pulsanti.
// ============================================================

const ROW = 52          // altezza riga
const INDENT = 36       // rientro per livello
const PAD = 24
const NODE_H = 38

export default function Tree({ viste, onOpen, onAddChild, onReparent }) {
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState(null)     // { id, x, y, over }
  const [ask, setAsk] = useState(null)       // { childId, parentId }
  const dragRef = useRef(null)
  const scrollRef = useRef(null)

  const { rows, byId, childrenOf, maxDepth } = useMemo(() => {
    const all = viste.filter(v => !v.is_template)
    const ids = new Set(all.map(v => v.id))
    const childrenOf = {}
    const roots = []
    all.forEach(v => {
      if (v.parent_id && ids.has(v.parent_id)) (childrenOf[v.parent_id] ||= []).push(v)
      else roots.push(v)
    })
    const sortF = (a, b) => (a.ordine || 0) - (b.ordine || 0)
    roots.sort(sortF)
    Object.values(childrenOf).forEach(arr => arr.sort(sortF))
    const rows = []
    let maxDepth = 0
    const walk = (v, depth) => {
      maxDepth = Math.max(maxDepth, depth)
      rows.push({ v, depth, idx: rows.length })
      ;(childrenOf[v.id] || []).forEach(c => walk(c, depth + 1))
    }
    roots.forEach(r => walk(r, 0))
    const byId = Object.fromEntries(rows.map(r => [r.v.id, r]))
    return { rows, byId, childrenOf, maxDepth }
  }, [viste])

  const xOf = (r) => PAD + r.depth * INDENT
  const yOf = (r) => PAD + r.idx * ROW

  // sfumatura: vicino alla radice più intenso, poi sbiadisce
  const shade = (depth) => {
    const pct = Math.max(6, 52 - depth * 11)
    return `color-mix(in srgb, var(--green-deep) ${pct}%, var(--panel))`
  }

  // ---- drag per spostare un nodo su un altro ramo ----
  const onNodeDown = (e, id) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, moved: false }
  }
  const onNodeMove = (e) => {
    const d = dragRef.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 10) return
    d.moved = true
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const overId = el?.closest?.('.tnode')?.getAttribute('data-id')
    setDrag({ id: d.id, x: e.clientX, y: e.clientY, over: (overId && overId !== d.id) ? overId : null })
  }
  const onNodeUp = () => {
    const d = dragRef.current; dragRef.current = null
    const info = drag; setDrag(null)
    if (!d) return
    if (!d.moved) { const r = byId[d.id]; if (r) onOpen(r.v); return }
    if (info?.over && onReparent) {
      // impedisce cicli: il target non può essere un discendente del nodo spostato
      let p = byId[info.over]
      while (p) {
        if (p.v.id === d.id) { alert('Non puoi spostare un ramo dentro sé stesso.'); return }
        p = p.v.parent_id ? byId[p.v.parent_id] : null
      }
      setAsk({ childId: d.id, parentId: info.over })
    }
  }

  const W = PAD * 2 + (maxDepth + 1) * INDENT + 420
  const H = PAD * 2 + rows.length * ROW + 120

  return (
    <div className="tree-wrap" data-noswipe="scroll" ref={scrollRef}>
      <div className="tree-zoom">
        <button className="iconbtn" onClick={() => setZoom(z => Math.min(1.6, z + 0.15))}>＋</button>
        <button className="iconbtn" onClick={() => setZoom(z => Math.max(0.5, z - 0.15))}>－</button>
        <button className="iconbtn" title="Reimposta" onClick={() => setZoom(1)}>⌂</button>
      </div>

      <div style={{ width: W * zoom, height: H * zoom, position: 'relative' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', width: W, height: H }}>

          <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {rows.map(r => {
              if (!r.v.parent_id || !byId[r.v.parent_id]) return null
              const p = byId[r.v.parent_id]
              const x0 = xOf(p) + 14                 // parte da sotto il genitore
              const y0 = yOf(p) + NODE_H
              const x1 = xOf(r)                      // arriva al bordo sinistro del figlio
              const y1 = yOf(r) + NODE_H / 2
              const rad = 10
              return (
                <path key={r.v.id}
                  d={`M ${x0} ${y0} L ${x0} ${y1 - rad} Q ${x0} ${y1} ${x0 + rad} ${y1} L ${x1} ${y1}`}
                  fill="none" stroke={shadeLine(r.depth)} strokeWidth="2.5" strokeLinecap="round" />
              )
            })}
          </svg>

          {rows.map(r => {
            const st = stageOf(r.v)
            return (
              <div key={r.v.id} data-id={r.v.id}
                className={'tnode' + (drag?.id === r.v.id ? ' grabbing' : '') + (drag?.over === r.v.id ? ' drop-on' : '')}
                style={{ left: xOf(r), top: yOf(r), background: shade(r.depth) }}
                onPointerDown={e => onNodeDown(e, r.v.id)}
                onPointerMove={onNodeMove}
                onPointerUp={onNodeUp}>
                <span className="tnode-dot" style={{ background: st.color }} title={st.label} />
                <span className="tnode-title">{r.v.titolo || 'Senza titolo'}</span>
                <button className="tnode-add" title="Aggiungi vista figlia"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onAddChild(r.v) }}>＋</button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="tree-hint">Tocca per aprire · ＋ aggiunge un ramo · trascina un nodo su un altro per spostarlo</div>

      {ask && (
        <div className="modal-bg" onClick={() => setAsk(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Spostare la vista</h3>
            <p style={{ color: 'var(--text-dim)' }}>
              Inserire <b style={{ color: 'var(--text)' }}>{byId[ask.childId]?.v.titolo}</b> sotto{' '}
              <b style={{ color: 'var(--text)' }}>{byId[ask.parentId]?.v.titolo}</b>?
            </p>
            <div className="row">
              <button className="btn ghost" onClick={() => setAsk(null)}>Annulla</button>
              <button className="btn" onClick={() => { onReparent(ask.childId, ask.parentId); setAsk(null) }}>Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// colore linea: come i nodi ma un filo più visibile
function shadeLine(depth) {
  const pct = Math.max(20, 70 - depth * 12)
  return `color-mix(in srgb, var(--green-bright) ${pct}%, var(--border))`
}
