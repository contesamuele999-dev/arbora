import { useMemo, useState, useRef, useEffect } from 'react'

// Vista collegamenti: 2.5D | mappa mentale | albero.
// Pan/zoom (mouse+touch). Trascina un nodo SU un altro per spostarlo di livello/ramo.
export default function MapView({ viste, links, onOpen, onAddVista, onReparent }) {
  const [mode, setMode] = useState('25d')
  const [activeLevels, setActiveLevels] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const [panel, setPanel] = useState(null) // toolbar mobile collassabile
  const stageRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const pan = useRef(null)
  const nodeDrag = useRef(null)
  const [dragInfo, setDragInfo] = useState(null) // { id, x, y, over }
  const [ask, setAsk] = useState(null)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const levels = useMemo(() => [...new Set(viste.map(v => v.livello || 0))].sort((a,b)=>a-b), [viste])

  const positioned = useMemo(() => {
    const byLevel = {}
    viste.forEach(v => { (byLevel[v.livello||0] ||= []).push(v) })
    return viste.map(v => {
      const lvl = v.livello || 0
      const peers = byLevel[lvl]; const idx = peers.indexOf(v); const n = peers.length
      let x, y
      if (mode === '25d') { x = (idx-(n-1)/2)*200 + lvl*26; y = lvl*130 }
      else if (mode === 'mind') {
        if (lvl===0){x=0;y=0} else { const a=(idx/Math.max(1,n))*Math.PI*2, r=lvl*190; x=Math.cos(a)*r; y=Math.sin(a)*r }
      } else { x=(idx-(n-1)/2)*190; y=lvl*150 }
      return { ...v, _x: x, _y: y }
    })
  }, [viste, mode])

  const posMap = useMemo(() => Object.fromEntries(positioned.map(p => [p.id, p])), [positioned])
  const dim = (lvl) => activeLevels && !activeLevels.includes(lvl)

  const originX = size.w / 2 + view.x
  const originY = size.h * 0.34 + view.y

  // ---- PAN (solo sullo sfondo) ----
  const onStageDown = (e) => {
    if (e.target.closest('.node') || e.target.closest('.map-ui')) return
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  const onStageMove = (e) => {
    if (nodeDrag.current) { onNodeMove(e); return }
    if (!pan.current) return
    setView(v => ({ ...v, x: pan.current.vx + (e.clientX - pan.current.x), y: pan.current.vy + (e.clientY - pan.current.y) }))
  }
  const onStageUp = (e) => {
    if (nodeDrag.current) onNodeUp(e)
    pan.current = null
  }

  // ---- DRAG NODO (per cambiare livello) ----
  const onNodeDown = (e, v) => {
    e.stopPropagation()
    nodeDrag.current = { id: v.id, startX: e.clientX, startY: e.clientY, moved: false }
  }
  const onNodeMove = (e) => {
    const d = nodeDrag.current; if (!d) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 6) return  // soglia: distingue click da drag
    d.moved = true
    // trova nodo sotto il cursore (escludendo quello trascinato)
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const overEl = el?.closest?.('.node')
    const overId = overEl?.getAttribute('data-id')
    setDragInfo({ id: d.id, x: e.clientX, y: e.clientY, over: (overId && overId !== d.id) ? overId : null })
  }
  const onNodeUp = () => {
    const d = nodeDrag.current; nodeDrag.current = null
    const info = dragInfo; setDragInfo(null)
    if (!d) return
    if (!d.moved) { const v = posMap[d.id]; if (v) onOpen(v); return }  // era un click
    if (info?.over && onReparent) setAsk({ childId: d.id, parentId: info.over })
  }

  const onWheel = (e) => setView(v => ({ ...v, z: Math.min(2.5, Math.max(0.35, v.z * (e.deltaY<0?1.1:0.9))) }))
  const zoomBy = (f) => setView(v => ({ ...v, z: Math.min(2.5, Math.max(0.35, v.z*f)) }))
  const resetView = () => setView({ x: 0, y: 0, z: 1 })

  const toggleLevel = (l) => setActiveLevels(prev => {
    if (!prev) return levels.filter(x => x===l)
    const next = prev.includes(l) ? prev.filter(x=>x!==l) : [...prev, l]
    return next.length===levels.length ? null : (next.length ? next : null)
  })

  const confirmMove = () => {
    const parent = posMap[ask.parentId]
    onReparent(ask.childId, ask.parentId)
    setAsk(null)
  }

  return (
    <div className="map-stage" ref={stageRef}
      onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerLeave={onStageUp}
      onWheel={onWheel}>

      {/* barra comandi unica in alto (niente sovrapposizioni) */}
      <div className="map-bar map-ui">
        <div className="map-modes">
          <button className={'tab'+(mode==='25d'?' active':'')} onClick={()=>setMode('25d')}>2.5D</button>
          <button className={'tab'+(mode==='mind'?' active':'')} onClick={()=>setMode('mind')}>Mentale</button>
          <button className={'tab'+(mode==='tree'?' active':'')} onClick={()=>setMode('tree')}>Albero</button>
        </div>
        <div className="map-spacer" />
        <div className="map-levels">
          <span className="map-lbl">Liv:</span>
          {levels.map(l => (
            <button key={l} className={'lvl-chip'+(!activeLevels||activeLevels.includes(l)?' on':'')} onClick={()=>toggleLevel(l)}>L{l}</button>
          ))}
        </div>
        {onAddVista && <button className="iconbtn map-add" title="Nuova vista" onClick={()=>onAddVista(false)}>＋</button>}
      </div>

      {/* zoom in basso a destra */}
      <div className="map-zoom map-ui">
        <button className="iconbtn" onClick={()=>zoomBy(1.2)}>＋</button>
        <button className="iconbtn" onClick={()=>zoomBy(0.83)}>－</button>
        <button className="iconbtn" title="Ricentra" onClick={resetView}>⌂</button>
      </div>

      <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--green-bright)" />
          </marker>
        </defs>
        <g transform={`translate(${originX}, ${originY}) scale(${view.z})`}>
          {links.map(lk => {
            const a = posMap[lk.da_vista], b = posMap[lk.a_vista]
            if (!a || !b) return null
            const faded = dim(a.livello||0) || dim(b.livello||0)
            const minor = lk.tipo === 'minore'
            const dx=b._x-a._x, dy=b._y-a._y, len=Math.hypot(dx,dy)||1, pad=46
            const x2=b._x-(dx/len)*pad, y2=b._y-(dy/len)*pad, x1=a._x+(dx/len)*(pad*0.7), y1=a._y+(dy/len)*(pad*0.7)
            return <line key={lk.id} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={minor?'#5a7568':'var(--green-bright)'} strokeWidth={minor?1.5:2.5}
              strokeDasharray={minor?'6 5':'0'} opacity={faded?0.1:(minor?0.55:0.9)}
              markerEnd={faded?undefined:'url(#arrow)'} />
          })}
        </g>
      </svg>

      <div style={{position:'absolute',left:0,top:0,transform:`translate(${originX}px,${originY}px) scale(${view.z})`,transformOrigin:'0 0'}}>
        {positioned.map(v => (
          <div key={v.id} data-id={v.id}
            className={'node'+(dim(v.livello||0)?' dim':'')+(dragInfo?.id===v.id?' grabbing':'')+(dragInfo?.over===v.id?' drop-on':'')}
            style={{ left: v._x, top: v._y }}
            onPointerDown={(e)=>onNodeDown(e, v)}>
            {v.titolo || 'Senza titolo'}
            <span className="node-lvl">livello {v.livello || 0}</span>
          </div>
        ))}
      </div>

      <div className="map-hint map-ui">Trascina un blocco su un altro per spostarlo di ramo · tocca per aprire</div>

      {ask && (
        <div className="modal-bg" onClick={()=>setAsk(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Spostare la vista</h3>
            <p style={{color:'var(--text-dim)'}}>
              Inserire <b style={{color:'var(--text)'}}>{posMap[ask.childId]?.titolo}</b> sotto il ramo{' '}
              <b style={{color:'var(--text)'}}>{posMap[ask.parentId]?.titolo}</b> (livello {(posMap[ask.parentId]?.livello||0)+1})?
            </p>
            <div className="row">
              <button className="btn ghost" onClick={()=>setAsk(null)}>Annulla</button>
              <button className="btn" onClick={confirmMove}>Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
