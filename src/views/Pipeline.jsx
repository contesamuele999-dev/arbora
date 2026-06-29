// Vista PIPELINE stile Google Keep: card delle viste ("pianeti")
export default function Pipeline({ viste, onOpen, onAdd }) {
  const preview = (v) => (v.blocchi || []).map(b => b.text).join('\n').replace(/[#*`>]/g, '').slice(0, 220)
  return (
    <div>
      <div className="section-head">
        <h2>Pipeline</h2>
        <span className="crumb">{viste.length} viste</span>
        <div className="spacer" />
        <button className="add-btn" onClick={onAdd}>＋ Nuova vista</button>
      </div>
      <div className="pipeline">
        {viste.map(v => (
          <div key={v.id} className="planet-card" onClick={() => onOpen(v)}>
            <h3>{v.titolo || 'Senza titolo'}</h3>
            <div className="preview">{preview(v) || 'Vuota…'}</div>
            <div className="meta"><span className="lvl-dot" /> livello {v.livello || 0}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
