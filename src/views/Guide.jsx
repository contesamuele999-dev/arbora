import { GUIDES } from '../lib/guides.js'

// Guida comandi di una sezione (Pipe · Tree · Progress · Editor).
export default function Guide({ section }) {
  const g = GUIDES[section] || GUIDES.pipe
  return (
    <div className="guide">
      <div className="guide-head"><span className="guide-ico">{g.icona}</span><h2>{g.titolo}</h2></div>
      <div className="guide-list">
        {g.righe.map(([k, v]) => (
          <div key={k} className="guide-row">
            <span className="guide-k">{k}</span>
            <span className="guide-v">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
