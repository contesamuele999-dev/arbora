import { useEffect, useRef, useState } from 'react'

// Modalità lavoro + tecnica Pomodoro.
// Default 25+5, editabile fino a 50+10. Suggerimenti di pausa.
export default function Pomodoro({ focusMode, onToggleFocus }) {
  const [open, setOpen] = useState(false)
  const [work, setWork] = useState(25)
  const [rest, setRest] = useState(5)
  const [phase, setPhase] = useState('work')      // work | rest
  const [left, setLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState(null)
  const tick = useRef(null)

  const clampWork = (n) => Math.min(50, Math.max(5, n || 25))
  const clampRest = (n) => Math.min(10, Math.max(1, n || 5))

  useEffect(() => { if (!running) setLeft((phase === 'work' ? work : rest) * 60) }, [work, rest, phase, running])

  useEffect(() => {
    if (!running) { clearInterval(tick.current); return }
    tick.current = setInterval(() => {
      setLeft(l => {
        if (l <= 1) {
          const next = phase === 'work' ? 'rest' : 'work'
          setPhase(next)
          setToast(next === 'rest'
            ? '🌿 Pausa! Allontanati un attimo: il cervello rielabora meglio le idee quando stacchi.'
            : '🌱 Si riparte. Riprendi il filo con la mente fresca.')
          setTimeout(() => setToast(null), 7000)
          return (next === 'work' ? work : rest) * 60
        }
        return l - 1
      })
    }, 1000)
    return () => clearInterval(tick.current)
  }, [running, phase, work, rest])

  // suggerimento pausa periodico anche fuori dal pomodoro
  useEffect(() => {
    const t = setInterval(() => {
      if (!running) {
        setToast('💡 Suggerimento: ogni tanto fai una pausa. Le intuizioni migliori arrivano quando lasci sedimentare.')
        setTimeout(() => setToast(null), 7000)
      }
    }, 25 * 60 * 1000)
    return () => clearInterval(t)
  }, [running])

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <>
      {toast && <div className="break-toast">{toast}</div>}
      <div className="pomodoro">
        {open ? (
          <div className="pomo-panel">
            <div className="pomo-phase">{phase === 'work' ? '🎯 Lavoro' : '🌿 Pausa'}</div>
            <div className="pomo-time">{mm}:{ss}</div>
            <div className="pomo-row">
              <button className="btn" onClick={() => setRunning(r => !r)}>{running ? 'Pausa' : 'Avvia'}</button>
              <button className="btn ghost" onClick={() => { setRunning(false); setPhase('work'); setLeft(work*60) }}>Reset</button>
            </div>
            <div className="pomo-cfg">
              lavoro <input type="number" value={work} min={5} max={50}
                onChange={e => setWork(clampWork(+e.target.value))} />
              pausa <input type="number" value={rest} min={1} max={10}
                onChange={e => setRest(clampRest(+e.target.value))} />
            </div>
            <div className="pomo-row">
              <button className="btn ghost" onClick={onToggleFocus}>{focusMode ? 'Esci da Focus' : 'Modalità Focus'}</button>
            </div>
            <div className="pomo-row">
              <button className="link-btn" onClick={() => setOpen(false)}>chiudi</button>
            </div>
          </div>
        ) : (
          <button className="pomo-btn" onClick={() => setOpen(true)}>
            🍅 {running ? `${mm}:${ss}` : 'Pomodoro'}
          </button>
        )}
      </div>
    </>
  )
}
