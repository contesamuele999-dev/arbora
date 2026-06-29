import { useMemo, useState, useRef, useEffect } from 'react'

// Vista collegamenti commutabile: 2.5D | mappa mentale | albero
// con filtro per livello. Pan/zoom con pointer events (mouse + touch).
export default function MapView({ viste, links, onOpen, onAddVista }) {
  const [mode, setMode] = useState('25d')
  const [activeLevels, setActiveLevels] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const stageRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const drag = useRef(null)
  const pinch = useRef(null)

  // misura lo stage per centrare correttamente (fix proporzioni mobile)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const levels = useMemo(() => [...new Set(viste.map(v => v.livello || 0))].sort((a,b)=>a-b), [viste])

  const positioned = useMemo(() => {
    const byLevel = {}
    viste.forEach(v => { (byLevel[v.livello||0] ||= []).push(v) })
    return viste.map(v => {
      const lvl = v.livello || 0
      const peers = byLevel[lvl]
      const idx = peers.indexOf(v)
      const n = peers.length
      let x, y
      if (mode === '25d') {
        const spread = 200
        x = (idx - (n - 1) / 2) * spread + lvl * 26
        y = lvl * 130
      } else if (mode === 'mind') {
        if (lvl === 0) { x = 0; y = 0 }
        else {
          const angle = (idx / Math.max(1, n)) * Math.PI * 2
          const r = lvl * 190
          x = Math.cos(angle) * r
          y = Math.sin(angle) * r
        }
      } else {
        const spread = 190
        x = (idx - (n - 1) / 2) * spread
        y = lvl * 150
      }
      return { ...v, _x: x, _y: y }
    })
  }, [viste, mode])

  const posMap = useMemo(() => Object.fromEntries(positioned.map(p => [p.id, p])), [positioned])
  const dim = (lvl) => activeLevels && !activeLevels.includes(lvl)

  // centro dello stage: tutte le coordinate dei nodi sono relative a questo punto
  const originX = size.w / 2 + view.x
  const originY = size.h * 0.32 + view.y

  // ---- pan & zoom con pointer events ----
  const onPointerDown = (e) => {
    if (e.target.closest('.node') || e.target.closest('.map-toolbar') || e.target.closest('.level-filter')) return
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setView(v => ({ ...v, x: drag.current.vx + (e.clientX - drag.current.x), y: drag.current.vy + (e.clientY - drag.current.y) }))
  }
  const onPointerUp = (e) => {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }
  const onWheel = (e) => {
    const dz = e.deltaY < 0 ? 1.1 : 0.9
    setView(v => ({ ...v, z: Math.min(2.5, Math.max(0.3, v.z * dz)) }))
  }
  const zoomBy = (f) => setView(v => ({ ...v, z: Math.min(2.5, Math.max(0.3, v.z * f)) }))
  const resetView = () => setView({ x: 0, y: 0, z: 1 })

  const toggleLevel = (l) => {
    setActiveLevels(prev => {
      if (!prev) return levels.filter(x => x === l)
      const has = prev.includes(l)
      const next = has ? prev.filter(x => x !== l) : [...prev, l]
      return next.length === levels.length ? null : (next.length ? next : null)
    })
  }

  return (
    <div className="map-stage" ref={stageRef}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      onWheel={onWheel}>

      <div className="map-toolbar">
        <button className={'tab' + (mode==='25d'?' active':'')} onClick={() => setMode('25d')}>2.5D</button>
        <button className={'tab' + (mode==='mind'?' active':'')} onClick={() => setMode('mind')}>Mentale</button>
        <button className={'tab' + (mode==='tree'?' active':'')} onClick={() => setMode('tree')}>Albero</button>
        {onAddVista && <button className="tab" title="Nuova vista" onClick={() => onAddVista(false)}>＋</button>}
      </div>

      <div className="map-zoom">
        <button className="iconbtn" onClick={() => zoomBy(1.2)}>＋</button>
        <button className="iconbtn" onClick={() => zoomBy(0.83)}>－</button>
        <button className="iconbtn" title="Ricentra" onClick={resetView}>⌂</button>
      </div>

      <div className="level-filter">
        <span style={{color:'var(--text-dim)',fontSize:12,alignSelf:'center',marginRight:4}}>Liv:</span>
        {levels.map(l => (
          <button key={l} className={'lvl-chip' + (!activeLevels || activeLevels.includes(l) ? ' on' : '')}
            onClick={() => toggleLevel(l)}>L{l}</button>
        ))}
      </div>

      <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d27e" />
          </marker>
          <marker id="arrow-minor" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a7568" />
          </marker>
        </defs>
        <g transform={`translate(${originX}, ${originY}) scale(${view.z})`}>
          {links.map(lk => {
            const a = posMap[lk.da_vista], b = posMap[lk.a_vista]
            if (!a || !b) return null
            const faded = dim(a.livello||0) || dim(b.livello||0)
            const minor = lk.tipo === 'minore'
            // accorcia la linea per non entrare nel nodo (lascia spazio alla freccia)
            const dx = b._x - a._x, dy = b._y - a._y
            const len = Math.hypot(dx, dy) || 1
            const pad = 46
            const x2 = b._x - (dx/len)*pad, y2 = b._y - (dy/len)*pad
            const x1 = a._x + (dx/len)*(pad*0.7), y1 = a._y + (dy/len)*(pad*0.7)
            return (
              <line key={lk.id} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={minor ? '#5a7568' : '#34d27e'} strokeWidth={minor?1.5:2.5}
                strokeDasharray={minor?'6 5':'0'} opacity={faded?0.1:(minor?0.55:0.9)}
                markerEnd={faded ? undefined : (minor ? 'url(#arrow-minor)' : 'url(#arrow)')} />
            )
          })}
        </g>
      </svg>

      <div style={{position:'absolute',left:0,top:0,transform:`translate(${originX}px,${originY}px) scale(${view.z})`,transformOrigin:'0 0'}}>
        {positioned.map(v => (
          <div key={v.id} className={'node' + (dim(v.livello||0) ? ' dim' : '')}
            style={{ left: v._x, top: v._y }}
            onClick={(e) => { e.stopPropagation(); onOpen(v) }}>
            {v.titolo || 'Senza titolo'}
            <span className="node-lvl">livello {v.livello || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
