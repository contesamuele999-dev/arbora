import { stageOf } from '../lib/stages.js'

// ============================================================
// PIPE — visioni (contenitori, sfondo tinto col loro colore)
// e viste (card neutre con indicatore colore della fase).
// ============================================================
export default function Pipeline({ visioni, viste, onOpen, onPreview, onAddVisione, onAddVista, onRenameVisione, onRecolorVisione }) {
  const preview = (v) => (v.blocchi || []).map(b => b.text).join(' ').replace(/[#*`>]/g, '').slice(0, 140)

  return (
    <div className="pipe">
      <div className="section-head">
        <h2>Pipe</h2>
        <span className="crumb">{visioni.length} visioni · {viste.length} viste</span>
        <div className="spacer" />
        <button className="add-btn" onClick={onAddVisione}>＋ Nuova visione</button>
      </div>

      {visioni.map(vis => {
        const mie = viste.filter(v => v.visione_id === vis.id)
        return (
          <section key={vis.id} className="vision-block"
            style={{ '--vcol': vis.colore || 'var(--green)' }}>
            <header className="vision-head">
              <label className="vision-swatch" title="Colore della visione">
                <input type="color" value={vis.colore || '#2e9e63'}
                  onChange={e => onRecolorVisione(vis, e.target.value)} />
              </label>
              <h3>{vis.titolo}</h3>
              <button className="iconbtn mini" title="Rinomina" onClick={() => onRenameVisione(vis)}>✎</button>
              <div className="spacer" />
              <span className="crumb">{mie.length} viste</span>
              <button className="add-btn mini" onClick={() => onAddVista(vis.id)}>＋ Vista</button>
            </header>

            <div className="vista-grid">
              {mie.map(v => {
                const st = stageOf(v)
                return (
                  <article key={v.id} className="vista-card" style={{ '--stage': st.color }}
                    onClick={() => onPreview(v)}>
                    <div className="vista-top">
                      <span className="stage-dot" title={st.label} />
                      <h4>{v.titolo || 'Senza titolo'}</h4>
                      <button className="iconbtn mini" title="Apri e modifica"
                        onClick={e => { e.stopPropagation(); onOpen(v) }}>✎</button>
                    </div>
                    <p className="vista-preview">{preview(v) || 'Vuota…'}</p>
                  </article>
                )
              })}
              {!mie.length && <div className="vista-empty">Nessuna vista: aggiungine una.</div>}
            </div>
          </section>
        )
      })}

      {!visioni.length && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
          Crea la tua prima visione per iniziare.
        </div>
      )}
    </div>
  )
}
