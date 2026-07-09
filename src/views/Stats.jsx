import { useEffect, useMemo, useRef, useState } from 'react'
import { getActivity } from '../lib/activity.js'

// ============================================================
// STATISTICHE — quante viste crei e quanti caratteri scrivi,
// su base giornaliera · mensile · annuale. Utile per capire
// i tuoi periodi più creativi. Grafici SVG, nessuna dipendenza.
// ============================================================
const p2 = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

export default function Stats({ viste }) {
  const [range, setRange] = useState('day')   // day | month | year
  const activity = useMemo(() => getActivity(), [])

  const data = useMemo(() => {
    const items = (viste || []).filter(v => !v.is_template && v.created_at)
    const notesByDay = {}
    for (const v of items) {
      const d = new Date(v.created_at)
      if (isNaN(d)) continue
      const k = dayKey(d)
      notesByDay[k] = (notesByDay[k] || 0) + 1
    }
    const charsByDay = {}
    for (const [k, val] of Object.entries(activity)) charsByDay[k] = val.chars || 0

    const buckets = []
    const now = new Date()
    if (range === 'day') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i)
        const k = dayKey(d)
        buckets.push({ key: k, label: `${d.getDate()}/${d.getMonth() + 1}`, notes: notesByDay[k] || 0, chars: charsByDay[k] || 0 })
      }
    } else if (range === 'month') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const pref = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
        let notes = 0, chars = 0
        for (const [k, n] of Object.entries(notesByDay)) if (k.startsWith(pref)) notes += n
        for (const [k, c] of Object.entries(charsByDay)) if (k.startsWith(pref)) chars += c
        buckets.push({ key: pref, label: `${MESI[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, notes, chars })
      }
    } else {
      const years = new Set()
      Object.keys(notesByDay).forEach(k => years.add(k.slice(0, 4)))
      Object.keys(charsByDay).forEach(k => years.add(k.slice(0, 4)))
      years.add(String(now.getFullYear()))
      ;[...years].sort().forEach(y => {
        let notes = 0, chars = 0
        for (const [k, n] of Object.entries(notesByDay)) if (k.startsWith(y)) notes += n
        for (const [k, c] of Object.entries(charsByDay)) if (k.startsWith(y)) chars += c
        buckets.push({ key: y, label: y, notes, chars })
      })
    }

    const totNotes = buckets.reduce((s, b) => s + b.notes, 0)
    const totChars = buckets.reduce((s, b) => s + b.chars, 0)
    const bestNotes = buckets.reduce((a, b) => (b.notes > (a?.notes || 0) ? b : a), null)
    const bestChars = buckets.reduce((a, b) => (b.chars > (a?.chars || 0) ? b : a), null)
    return { buckets, totNotes, totChars, bestNotes, bestChars }
  }, [viste, activity, range])

  return (
    <div className="stats">
      <div className="stats-range">
        {[['day', 'Giorno'], ['month', 'Mese'], ['year', 'Anno']].map(([id, lbl]) => (
          <button key={id} className={'chip' + (range === id ? ' active' : '')} onClick={() => setRange(id)}>{lbl}</button>
        ))}
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-num">{data.totNotes}</div>
          <div className="stat-lbl">viste create</div>
          {data.bestNotes?.notes > 0 && <div className="stat-sub">picco: {data.bestNotes.label} ({data.bestNotes.notes})</div>}
        </div>
        <div className="stat-card">
          <div className="stat-num">{data.totChars.toLocaleString('it-IT')}</div>
          <div className="stat-lbl">lettere scritte</div>
          {data.bestChars?.chars > 0 && <div className="stat-sub">picco: {data.bestChars.label} ({data.bestChars.chars.toLocaleString('it-IT')})</div>}
        </div>
      </div>

      <Chart title="Viste create" color="var(--green-bright)" buckets={data.buckets} field="notes" best={data.bestNotes?.key} />
      <Chart title="Lettere scritte" color="var(--accent)" buckets={data.buckets} field="chars" best={data.bestChars?.key} />

      <p className="stats-note">Le viste create si basano sulla data di creazione. Le lettere scritte vengono registrate su questo dispositivo a partire dal loro monitoraggio: lo storico cresce con l’uso.</p>
    </div>
  )
}

function Chart({ title, color, buckets, field, best }) {
  const max = Math.max(1, ...buckets.map(b => b[field]))
  const W = Math.max(320, buckets.length * 26)
  const H = 140, PADB = 22
  const bw = (W / buckets.length) * 0.62
  const scrollRef = useRef(null)

  // di default lo scroll mostra i dati più recenti (a destra), non l'inizio della serie
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [W, buckets.length])

  return (
    <div className="chart">
      <div className="chart-title">{title}</div>
      <div className="chart-scroll" data-noswipe="scroll" ref={scrollRef}>
        <svg width={W} height={H} className="chart-svg">
          {buckets.map((b, i) => {
            const x = (i + 0.5) * (W / buckets.length)
            const h = (b[field] / max) * (H - PADB - 10)
            const y = H - PADB - h
            return (
              <g key={b.key}>
                <rect x={x - bw / 2} y={y} width={bw} height={Math.max(h, b[field] ? 2 : 0)} rx="3"
                  fill={b.key === best && b[field] > 0 ? color : `color-mix(in srgb, ${color} 45%, var(--panel-2))`} />
                {b[field] > 0 && <text x={x} y={y - 3} textAnchor="middle" className="chart-val">{b[field]}</text>}
                <text x={x} y={H - 6} textAnchor="middle" className="chart-lbl">{b.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
