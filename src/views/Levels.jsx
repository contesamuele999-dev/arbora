import { useMemo, useState } from 'react'

// Scheda LIVELLI: blocchi (viste) trascinabili per cambiare livello/ramo.
// Trascinando una vista su un'altra, quella diventa il nuovo genitore.
export default function Levels({ viste, links, onReparent, onOpen }) {
  const [dragId, setDragId] = useState(null)
  const [askDrop, setAskDrop] = useState(null) // { childId }

  const byLevel = useMemo(() => {
    const m = {}
    viste.forEach(v => { (m[v.livello||0] ||= []).push(v) })
    return m
  }, [viste])
  const levels = Object.keys(byLevel).map(Number).sort((a,b)=>a-b)

  const handleDrop = (targetParent) => {
    if (!dragId || dragId === targetParent?.id) { setDragId(null); return }
    setAskDrop({ childId: dragId, parent: targetParent })
  }

  const confirmReparent = () => {
    onReparent(askDrop.childId, askDrop.parent?.id ?? null)
    setAskDrop(null); setDragId(null)
  }

  return (
    <div style={{padding:18}}>
      <div className="section-head" style={{padding:'0 0 12px'}}>
        <h2>Livelli</h2>
        <span className="crumb">Trascina una vista su un'altra per spostarla di ramo/livello</span>
      </div>

      {levels.map(lvl => (
        <div key={lvl} style={{marginBottom:24}}>
          <div style={{color:'var(--text-dim)',fontWeight:700,marginBottom:8,fontSize:13}}>LIVELLO {lvl}</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {byLevel[lvl].map(v => (
              <div key={v.id}
                draggable
                onDragStart={() => setDragId(v.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(v)}
                onClick={() => onOpen(v)}
                className="world-card"
                style={{minWidth:160,cursor:'grab',opacity:dragId===v.id?0.4:1,padding:'12px 14px'}}>
                <h3 style={{fontSize:14,margin:0}}>{v.titolo||'Senza titolo'}</h3>
                <div className="count">L{v.livello||0}{v.parent_id?'':' · radice'}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* zona "rendi radice" */}
      <div onDragOver={e=>e.preventDefault()} onDrop={() => handleDrop(null)}
        style={{marginTop:16,padding:16,border:'1px dashed var(--border)',borderRadius:12,color:'var(--text-dim)',textAlign:'center'}}>
        Trascina qui per rendere una vista di livello 0 (radice)
      </div>

      {askDrop && (
        <div className="modal-bg" onClick={() => setAskDrop(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Spostare la vista</h3>
            <p style={{color:'var(--text-dim)'}}>
              Vuoi inserire <b style={{color:'var(--text)'}}>{viste.find(v=>v.id===askDrop.childId)?.titolo}</b>{' '}
              {askDrop.parent
                ? <>sotto il ramo <b style={{color:'var(--text)'}}>{askDrop.parent.titolo}</b>?</>
                : <>come <b style={{color:'var(--text)'}}>radice (livello 0)</b>?</>}
            </p>
            <div className="row">
              <button className="btn ghost" onClick={() => setAskDrop(null)}>Annulla</button>
              <button className="btn" onClick={confirmReparent}>Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
