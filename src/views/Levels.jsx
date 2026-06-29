import { useMemo, useState } from 'react'

// Scheda LIVELLI - due modi per spostare una vista di ramo/livello:
//  1) TAP: tocca una vista per "prenderla", poi tocca la destinazione (genitore).
//  2) DRAG: trascina una vista sopra un'altra (mouse).
// La gerarchia nasce dagli hyperlink [[...]]: qui la riorganizzi a mano.
export default function Levels({ viste, links, onReparent, onOpen }) {
  const [dragId, setDragId] = useState(null)   // drag mouse
  const [picked, setPicked] = useState(null)   // selezione a tap
  const [askDrop, setAskDrop] = useState(null)

  const byLevel = useMemo(() => {
    const m = {}
    viste.forEach(v => { (m[v.livello||0] ||= []).push(v) })
    return m
  }, [viste])
  const levels = Object.keys(byLevel).map(Number).sort((a,b)=>a-b)

  const requestMove = (childId, parent) => {
    if (!childId || childId === parent?.id) return
    setAskDrop({ childId, parent })
  }

  // ---- modalità TAP ----
  const onCardTap = (v) => {
    if (!picked) { setPicked(v.id); return }       // prima: prendi
    if (picked === v.id) { setPicked(null); return } // ri-tap = deseleziona
    requestMove(picked, v)                          // seconda: scegli genitore
  }

  const confirmReparent = () => {
    onReparent(askDrop.childId, askDrop.parent?.id ?? null)
    setAskDrop(null); setDragId(null); setPicked(null)
  }

  const pickedVista = viste.find(v => v.id === picked)

  return (
    <div style={{padding:18}}>
      <div className="section-head" style={{padding:'0 0 8px'}}>
        <h2>Livelli</h2>
      </div>

      {/* guida d'uso */}
      <div className="levels-help">
        {picked
          ? <>Hai preso <b>{pickedVista?.titolo}</b>. Ora tocca la vista che vuoi come <b>genitore</b> (oppure la zona radice in fondo). <button className="link-btn" onClick={() => setPicked(null)}>annulla</button></>
          : <>Tocca una vista per <b>prenderla</b>, poi tocca un'altra vista per metterla <b>sotto</b> di essa. Su PC puoi anche trascinarle. Tocca <b>✎/apri</b> per modificarne il contenuto.</>}
      </div>

      {levels.map(lvl => (
        <div key={lvl} style={{marginBottom:22}}>
          <div className="level-label">LIVELLO {lvl} {lvl===0 && <span className="crumb">· radici</span>}</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {byLevel[lvl].map(v => (
              <div key={v.id}
                draggable
                onDragStart={() => setDragId(v.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => requestMove(dragId, v)}
                onClick={() => onCardTap(v)}
                className={'world-card level-card' + (picked===v.id ? ' picked' : '') + (picked && picked!==v.id ? ' targetable' : '')}
                style={{minWidth:150,opacity:dragId===v.id?0.4:1}}>
                <h3 style={{fontSize:14,margin:0}}>{v.titolo||'Senza titolo'}</h3>
                <div className="count">L{v.livello||0}{v.parent_id?'':' · radice'}</div>
                <button className="open-mini iconbtn" title="Apri e modifica" onClick={(e)=>{e.stopPropagation(); onOpen(v)}}>✎</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* zona radice */}
      <div className={'root-drop' + (picked ? ' targetable' : '')}
        onDragOver={e=>e.preventDefault()} onDrop={() => requestMove(dragId, null)}
        onClick={() => picked && requestMove(picked, null)}>
        ⬆ {picked ? 'Tocca qui per rendere la vista una radice (livello 0)' : 'Trascina qui (o prendi e tocca) per rendere una vista radice'}
      </div>

      {askDrop && (
        <div className="modal-bg" onClick={() => setAskDrop(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Spostare la vista</h3>
            <p style={{color:'var(--text-dim)'}}>
              Vuoi inserire <b style={{color:'var(--text)'}}>{viste.find(v=>v.id===askDrop.childId)?.titolo}</b>{' '}
              {askDrop.parent
                ? <>sotto il ramo <b style={{color:'var(--text)'}}>{askDrop.parent.titolo}</b> (livello {(askDrop.parent.livello||0)+1})?</>
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
