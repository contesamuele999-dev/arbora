import { useState } from 'react'
import { STAGES, stageOf } from '../lib/stages.js'

// ============================================================
// PROGRESS — bacheca kanban indipendente: le viste categorizzate
// per fase del flusso di lavoro. Drag&drop su desktop, selettore
// fase (tocca il pallino) su touch.
// ============================================================
export default function Progress({ viste, onOpen, onSetStage }) {
  const [dragId, setDragId] = useState(null)
  const [pick, setPick] = useState(null)   // vista di cui cambiare fase
  const items = viste.filter(v => !v.is_template)

  return (
    <div className="progress-wrap">
      <div className="section-head">
        <h2>Progress</h2>
        <span className="crumb">{items.length} viste nel flusso</span>
      </div>

      <div className="kanban" data-noswipe="scroll">
        {STAGES.map(s => {
          const col = items.filter(v => stageOf(v).id === s.id)
          return (
            <div key={s.id} className="kcol" style={{ '--stage': s.color }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) onSetStage(dragId, s.id); setDragId(null) }}>
              <div className="kcol-head">
                <span className="stage-dot" />
                <span>{s.label}</span>
                <span className="kcount">{col.length}</span>
              </div>
              <div className="kcol-body">
                {col.map(v => (
                  <div key={v.id} className="kcard" style={{ '--stage': s.color }}
                    draggable onDragStart={() => setDragId(v.id)} onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(v)}>
                    <button className="stage-dot as-btn" title="Cambia fase"
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
