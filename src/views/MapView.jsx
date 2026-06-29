import { useMemo, useState, useRef } from 'react'

// Vista collegamenti commutabile: 2.5D | mappa mentale | albero
// con filtro per livello gerarchico.
export default function MapView({ viste, links, onOpen }) {
  const [mode, setMode] = useState('25d')      // '25d' | 'mind' | 'tree'
  const [activeLevels, setActiveLevels] = useState(null) // null = tutti
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const drag = useRef(null)

  const levels = useMemo(() => [...new Set(viste.map(v => v.livello || 0))].sort((a,b)=>a-b), [viste])

  // calcola posizioni dei nodi in base alla modalità
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
        // disposizione isometrica a strati
        const spread = 220
        x = (idx - (n - 1) / 2) * spread + lvl * 40
        y = lvl * 150 - lvl * 30  // leggero "skew" 2.5D
        // offset prospettico
        x += lvl * 18
      } else if (mode === 'mind') {
        // radiale dal centro
        if (lvl === 0) { x = 0; y = 0 }
        else {
          const angle = (idx / Math.max(1, n)) * Math.PI * 2
          const r = lvl * 200
          x = Math.cos(angle) * r
          y = Math.sin(angle) * r
        }
      } else { // tree
        const spread = 200
        x = (idx - (n - 1) / 2) * spread
        y = lvl * 160
      }
      return { ...v, _x: x, _y: y }
    })
  }, [viste, mode])

  const posMap = useMemo(() => Object.fromEntries(positioned.map(p => [p.id, p])), [positioned])
  const dim = (lvl) => activeLevels && !activeLevels.includes(lvl)

  // pan & zoom
  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y } }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setView(v => ({ ...v, x: drag.current.vx + (e.clientX - drag.current.x), y: drag.current.vy + (e.clientY - drag.current.y) }))
  }
  const onPointerUp = () => { drag.current = null }
  const onWheel = (e) => {
    const dz = e.deltaY < 0 ? 1.1 : 0.9
    setView(v => ({ ...v, z: Math.min(2.5, Math.max(0.3, v.z * dz)) }))
  }

  const toggleLevel = (l) => {
    setActiveLevels(prev => {
      if (!prev) return levels.filter(x => x === l)
      const has = prev.includes(l)
      const next = has ? prev.filter(x => x !== l) : [...prev, l]
      return next.length === levels.length ? null : (next.length ? next : null)
    })
  }

  const cx = useRef(null)

  return (
    <div className="map-stage"
      onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
      onWheel={onWheel} ref={cx}>

      <div className="map-toolbar">
        <button className={'tab' + (mode==='25d'?' active':'')} onClick={() => setMode('25d')}>2.5D</button>
        <button className={'tab' + (mode==='mind'?' active':'')} onClick={() => setMode('mind')}>Mappa mentale</button>
        <button className={'tab' + (mode==='tree'?' active':'')} onClick={() => setMode('tree')}>Albero</button>
      </div>

      <div className="level-filter">
        <span style={{color:'var(--text-dim)',fontSize:12,alignSelf:'center',marginRight:4}}>Livelli:</span>
        {levels.map(l => (
          <button key={l} className={'lvl-chip' + (!activeLevels || activeLevels.includes(l) ? ' on' : '')}
            onClick={() => toggleLevel(l)}>L{l}</button>
        ))}
      </div>

      <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
        <g transform={`translate(${innerCenterX(cx)+view.x}, ${120+view.y}) scale(${view.z})`}>
          {links.map(lk => {
            const a = posMap[lk.da_vista], b = posMap[lk.a_vista]
            if (!a || !b) return null
            const faded = dim(a.livello||0) || dim(b.livello||0)
            const minor = lk.tipo === 'minore'
            return (
              <line key={lk.id} x1={a._x} y1={a._y} x2={b._x} y2={b._y}
                stroke={minor ? '#3a5246' : '#2e9e63'} strokeWidth={minor?1:2}
                strokeDasharray={minor?'5 5':'0'} opacity={faded?0.08:(minor?0.5:0.8)} />
            )
          })}
        </g>
      </svg>

      <div style={{position:'absolute',left:'50%',top:120,transform:`translate(${view.x}px,${view.y}px) scale(${view.z})`,transformOrigin:'0 0'}}>
        {positioned.map(v => (
          <div key={v.id} className={'node' + (dim(v.livello||0) ? ' dim' : '')}
            style={{ left: v._x, top: v._y, transform: `translate(-50%,-50%) ${mode==='25d' ? 'skewX(-6deg)' : ''}` }}
            onClick={(e) => { e.stopPropagation(); onOpen(v) }}>
            {v.titolo || 'Senza titolo'}
            <span className="node-lvl">livello {v.livello || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function innerCenterX(ref) {
  return ref.current ? ref.current.clientWidth / 2 : 400
}
