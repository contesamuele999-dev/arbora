import { useEffect, useState, useCallback } from 'react'
import { useAuth } from './lib/auth.jsx'
import { store } from './lib/store.js'
import Auth from './pages/Auth.jsx'
import Editor from './views/Editor.jsx'
import MapView from './views/MapView.jsx'
import Pipeline from './views/Pipeline.jsx'
import Levels from './views/Levels.jsx'
import Pomodoro from './views/Pomodoro.jsx'
import { Privacy, Terms } from './pages/Legal.jsx'

const TABS = [
  { id: 'mondi', label: 'Mondi' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'mappa', label: 'Mappa' },
  { id: 'livelli', label: 'Livelli' },
]

export default function App() {
  const { user, loading, signOut, isDemo } = useAuth()
  const [tab, setTab] = useState('mondi')
  const [vite, setVite] = useState([])
  const [visioni, setVisioni] = useState([])
  const [viste, setViste] = useState([])
  const [links, setLinks] = useState([])
  const [vitaSel, setVitaSel] = useState(null)
  const [visioneSel, setVisioneSel] = useState(null)
  const [vistaAperta, setVistaAperta] = useState(null)
  const [focusMode, setFocusMode] = useState(false)
  const [legal, setLegal] = useState(null)   // 'privacy' | 'terms' | null
  const [menu, setMenu] = useState(false)

  // carica dati
  const reload = useCallback(async () => {
    const vt = await store.list('vite')
    setVite(vt)
    if (vt.length && !vitaSel) setVitaSel(vt[0])
  }, [vitaSel])

  useEffect(() => { if (user) reload() }, [user])

  useEffect(() => {
    if (!vitaSel) return
    store.list('visioni', { vita_id: vitaSel.id }).then(vs => {
      setVisioni(vs)
      if (vs.length && (!visioneSel || visioneSel.vita_id !== vitaSel.id)) setVisioneSel(vs[0])
    })
  }, [vitaSel])

  useEffect(() => {
    if (!visioneSel) { setViste([]); return }
    store.list('viste', { visione_id: visioneSel.id }).then(async vs => {
      setViste(vs)
      const allLinks = await store.list('links')
      const ids = new Set(vs.map(v => v.id))
      setLinks(allLinks.filter(l => ids.has(l.da_vista) && ids.has(l.a_vista)))
    })
  }, [visioneSel])

  if (loading) return <div style={{display:'grid',placeItems:'center',height:'100dvh'}}>Caricamento…</div>
  if (!user) return <Auth />

  // ---- azioni ----
  const addVita = async () => {
    const v = await store.insert('vite', { titolo: 'Nuova vita', colore: '#1f7a4d', ordine: vite.length })
    setVite([...vite, v]); setVitaSel(v)
  }
  const addVisione = async () => {
    if (!vitaSel) return
    const v = await store.insert('visioni', { vita_id: vitaSel.id, titolo: 'Nuova visione', colore: '#2e9e63', ordine: visioni.length })
    setVisioni([...visioni, v]); setVisioneSel(v); setTab('pipeline')
  }
  const addVista = async (template = false) => {
    if (!visioneSel) return
    const v = await store.insert('viste', {
      visione_id: visioneSel.id, titolo: template ? 'Nuovo template' : 'Nuova vista',
      blocchi: template ? [{ id: 't1', text: '# Titolo' }, { id: 't2', text: '## Sezione' }, { id: 't3', text: '- punto' }] : [{ id: 'b1', text: '' }],
      is_template: template, livello: 0, parent_id: null, pos_x: 0, pos_y: 0,
    })
    setViste([...viste, v]); setVistaAperta(v)
  }

  const saveVista = async (updated) => {
    await store.update('viste', updated.id, { titolo: updated.titolo, blocchi: updated.blocchi })
    setViste(vs => vs.map(v => v.id === updated.id ? { ...v, ...updated } : v))
    if (vistaAperta?.id === updated.id) setVistaAperta({ ...vistaAperta, ...updated })
  }

  // hyperlink [[Titolo]] -> apre la vista con quel titolo (o la crea)
  const openByName = async (name) => {
    let target = viste.find(v => (v.titolo || '').toLowerCase() === name.toLowerCase())
    if (!target) {
      target = await store.insert('viste', { visione_id: visioneSel.id, titolo: name, blocchi: [{id:'b1',text:''}], livello: (vistaAperta?.livello||0)+1, parent_id: vistaAperta?.id||null, pos_x: 0, pos_y: 0 })
      setViste(vs => [...vs, target])
      if (vistaAperta) {
        const lk = await store.insert('links', { da_vista: vistaAperta.id, a_vista: target.id, tipo: 'maggiore' })
        setLinks(ls => [...ls, lk])
      }
    }
    setVistaAperta(target)
  }

  // riparent da scheda Livelli
  const reparent = async (childId, parentId) => {
    const parent = viste.find(v => v.id === parentId)
    const newLevel = parent ? (parent.livello || 0) + 1 : 0
    await store.update('viste', childId, { parent_id: parentId, livello: newLevel })
    setViste(vs => vs.map(v => v.id === childId ? { ...v, parent_id: parentId, livello: newLevel } : v))
    // aggiorna link maggiore
    if (parentId) {
      const exists = links.find(l => l.a_vista === childId && l.tipo === 'maggiore')
      if (!exists) {
        const lk = await store.insert('links', { da_vista: parentId, a_vista: childId, tipo: 'maggiore' })
        setLinks(ls => [...ls, lk])
      }
    }
  }

  if (legal) {
    return (
      <div className="app">
        <div className="topbar">
          <div className="brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><span>Arbora</span></div>
          <div className="spacer" />
          <button className="iconbtn" onClick={() => setLegal(null)}>✕</button>
        </div>
        <div className="content">{legal === 'privacy' ? <Privacy /> : <Terms />}</div>
      </div>
    )
  }

  // editor a tutto schermo
  if (vistaAperta) {
    return (
      <div className="app">
        <div className="topbar">
          <button className="iconbtn" onClick={() => setVistaAperta(null)}>←</button>
          <div className="brand"><span>{visioneSel?.titolo}</span></div>
          <div className="spacer" />
          {!focusMode && <button className="iconbtn" title="Duplica come template" onClick={() => addVista(true)}>⎘</button>}
          <button className="iconbtn" title="Focus" onClick={() => setFocusMode(f => !f)}>{focusMode ? '🔅' : '🎯'}</button>
        </div>
        <div className="content">
          <Editor vista={vistaAperta} onChange={saveVista} onWikilink={openByName} focusMode={focusMode} />
        </div>
        <Pomodoro focusMode={focusMode} onToggleFocus={() => setFocusMode(f => !f)} />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" /><span>Arbora</span></div>
        <div className="spacer" />
        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="spacer" />
        <button className="iconbtn" onClick={() => setMenu(true)}>☰</button>
      </div>

      <div className="content">
        {tab === 'mondi' && (
          <Worlds vite={vite} visioni={visioni} vitaSel={vitaSel} setVitaSel={setVitaSel}
            setVisioneSel={(v) => { setVisioneSel(v); setTab('pipeline') }}
            addVita={addVita} addVisione={addVisione} />
        )}
        {tab === 'pipeline' && (
          visioneSel ? <Pipeline viste={viste} onOpen={setVistaAperta} onAdd={() => addVista(false)} />
            : <Empty msg="Seleziona o crea una visione nei Mondi." />
        )}
        {tab === 'mappa' && (
          viste.length ? <MapView viste={viste} links={links} onOpen={setVistaAperta} />
            : <Empty msg="Crea qualche vista per vedere la mappa." />
        )}
        {tab === 'livelli' && (
          viste.length ? <Levels viste={viste} links={links} onReparent={reparent} onOpen={setVistaAperta} />
            : <Empty msg="Crea qualche vista per organizzare i livelli." />
        )}
      </div>

      <Pomodoro focusMode={focusMode} onToggleFocus={() => setFocusMode(f => !f)} />

      {menu && (
        <div className="modal-bg" onClick={() => setMenu(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Menu</h3>
            <div className="menu-list">
              <button onClick={() => { addVista(true); setMenu(false) }}>＋ Crea template</button>
              <button onClick={() => { setLegal('privacy'); setMenu(false) }}>Privacy</button>
              <button onClick={() => { setLegal('terms'); setMenu(false) }}>Termini e condizioni</button>
              {!isDemo && <button onClick={() => { signOut(); setMenu(false) }}>Esci ({user.email})</button>}
            </div>
            <div className="copyright" style={{marginTop:16,borderTop:'none'}}>
              Arbora © {new Date().getFullYear()} — Sviluppata da <b>Samuele Contessa</b>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Worlds({ vite, visioni, vitaSel, setVitaSel, setVisioneSel, addVita, addVisione }) {
  return (
    <div>
      <div className="section-head">
        <h2>Vite</h2>
        <span className="crumb">universi di progetti</span>
        <div className="spacer" />
        <button className="add-btn" onClick={addVita}>＋ Nuova vita</button>
      </div>
      <div className="grid-worlds">
        {vite.map(v => (
          <div key={v.id} className={'world-card'} onClick={() => setVitaSel(v)}
            style={{outline: vitaSel?.id===v.id ? '2px solid var(--green-bright)' : 'none'}}>
            <div className="swatch" style={{background:v.colore}} />
            <h3>{v.titolo}</h3>
            <div className="count">tocca per aprire le visioni</div>
          </div>
        ))}
      </div>

      {vitaSel && (
        <>
          <div className="section-head">
            <h2>Visioni di "{vitaSel.titolo}"</h2>
            <span className="crumb">mondi · progetti</span>
            <div className="spacer" />
            <button className="add-btn" onClick={addVisione}>＋ Nuova visione</button>
          </div>
          <div className="grid-worlds">
            {visioni.map(v => (
              <div key={v.id} className="world-card" onClick={() => setVisioneSel(v)}>
                <div className="swatch" style={{background:v.colore}} />
                <h3>{v.titolo}</h3>
                <div className="count">apri la pipeline di viste</div>
              </div>
            ))}
            {!visioni.length && <Empty msg="Nessuna visione: creane una." />}
          </div>
        </>
      )}
    </div>
  )
}

function Empty({ msg }) {
  return <div style={{padding:40,textAlign:'center',color:'var(--text-dim)'}}>{msg}</div>
}
