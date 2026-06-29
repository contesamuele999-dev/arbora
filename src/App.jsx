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
import { THEMES, applyTheme, loadTheme } from './lib/themes.js'
import { exportBackup, importBackup } from './lib/backup.js'

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
  const [legal, setLegal] = useState(null)
  const [menu, setMenu] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [theme, setTheme] = useState('foresta')
  const [themeOpen, setThemeOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')

  const reload = useCallback(async () => {
    const vt = await store.list('vite')
    setVite(vt)
    if (vt.length && !vitaSel) setVitaSel(vt[0])
  }, [vitaSel])

  useEffect(() => { setTheme(loadTheme()) }, [])
  useEffect(() => { if (user) reload() }, [user])

  useEffect(() => {
    if (!vitaSel) return
    // se la visione selezionata appartiene a un'altra vita, deselezionala subito
    setVisioneSel(prev => (prev && prev.vita_id !== vitaSel.id) ? null : prev)
    store.list('visioni', { vita_id: vitaSel.id }).then(vs => {
      setVisioni(vs)
      setVisioneSel(prev => {
        if (prev && vs.some(x => x.id === prev.id)) return prev   // ancora valida
        return vs.length ? vs[0] : null                            // altrimenti prima o nulla
      })
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

  const addVita = () => {
    setPrompt({ titolo: 'Nuova vita', label: 'Nome della vita', valore: '', onOk: async (nome) => {
      const v = await store.insert('vite', { titolo: nome, colore: '#1f7a4d', ordine: vite.length })
      setVite(prev => [...prev, v]); setVitaSel(v)
    }})
  }
  const addVisione = () => {
    if (!vitaSel) return
    setPrompt({ titolo: 'Nuova visione', label: 'Nome della visione', valore: '', onOk: async (nome) => {
      const v = await store.insert('visioni', { vita_id: vitaSel.id, titolo: nome, colore: '#2e9e63', ordine: visioni.length })
      setVisioni(prev => [...prev, v]); setVisioneSel(v); setTab('pipeline')
    }})
  }
  const addVista = (template = false) => {
    if (!visioneSel) return
    setPrompt({ titolo: template ? 'Nuovo template' : 'Nuova vista', label: 'Titolo della vista', valore: '', onOk: async (nome) => {
      const v = await store.insert('viste', {
        visione_id: visioneSel.id, titolo: nome,
        blocchi: template ? [{ id: 't1', text: '# ' + nome }, { id: 't2', text: '## Sezione' }, { id: 't3', text: '- punto' }] : [{ id: 'b1', text: '' }],
        is_template: template, livello: 0, parent_id: null, pos_x: 0, pos_y: 0, ordine: viste.length,
      })
      setViste(prev => [...prev, v]); setVistaAperta(v)
    }})
  }

  const renameVita = (vita) => {
    setPrompt({ titolo: 'Rinomina vita', label: 'Nome della vita', valore: vita.titolo, onOk: async (nome) => {
      await store.update('vite', vita.id, { titolo: nome })
      setVite(prev => prev.map(v => v.id === vita.id ? { ...v, titolo: nome } : v))
      setVitaSel(prev => prev?.id === vita.id ? { ...prev, titolo: nome } : prev)
    }})
  }
  const renameVisione = (visione) => {
    setPrompt({ titolo: 'Rinomina visione', label: 'Nome della visione', valore: visione.titolo, onOk: async (nome) => {
      await store.update('visioni', visione.id, { titolo: nome })
      setVisioni(prev => prev.map(v => v.id === visione.id ? { ...v, titolo: nome } : v))
      setVisioneSel(prev => prev?.id === visione.id ? { ...prev, titolo: nome } : prev)
    }})
  }

  const saveVista = async (updated) => {
    await store.update('viste', updated.id, { titolo: updated.titolo, blocchi: updated.blocchi })
    setViste(vs => vs.map(v => v.id === updated.id ? { ...v, ...updated } : v))
    if (vistaAperta?.id === updated.id) setVistaAperta({ ...vistaAperta, ...updated })
  }

  const openByName = async (name) => {
    let target = viste.find(v => (v.titolo || '').toLowerCase() === name.toLowerCase())
    if (!target) {
      target = await store.insert('viste', { visione_id: visioneSel.id, titolo: name, blocchi: [{id:'b1',text:''}], livello: (vistaAperta?.livello||0)+1, parent_id: vistaAperta?.id||null, pos_x: 0, pos_y: 0, ordine: viste.length })
      setViste(vs => [...vs, target])
      if (vistaAperta) {
        const lk = await store.insert('links', { da_vista: vistaAperta.id, a_vista: target.id, tipo: 'maggiore' })
        setLinks(ls => [...ls, lk])
      }
    }
    setVistaAperta(target)
  }

  const chooseTheme = (id) => { applyTheme(id); setTheme(id); }

  const doExport = async () => {
    setBusy('export'); 
    try { await exportBackup() } finally { setBusy(''); setMenu(false) }
  }
  const doImport = async (file) => {
    setBusy('import')
    try {
      await importBackup(file)
      await reload()
      setVitaSel(null); setVisioneSel(null)
      alert('Backup importato con successo.')
    } catch (e) {
      alert('Errore import: ' + (e?.message || e))
    } finally { setBusy(''); setMenu(false) }
  }

  const reparent = async (childId, parentId) => {
    const parent = viste.find(v => v.id === parentId)
    const newLevel = parent ? (parent.livello || 0) + 1 : 0
    await store.update('viste', childId, { parent_id: parentId, livello: newLevel })
    setViste(vs => vs.map(v => v.id === childId ? { ...v, parent_id: parentId, livello: newLevel } : v))
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
        {prompt && <NamePrompt data={prompt} onClose={() => setPrompt(null)} />}
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
          <Worlds vite={vite} visioni={visioni} viste={viste}
            vitaSel={vitaSel} setVitaSel={setVitaSel}
            visioneSel={visioneSel} setVisioneSel={setVisioneSel}
            onOpenVista={setVistaAperta} onPreviewVista={setPreview} addVita={addVita} addVisione={addVisione} addVista={addVista}
            renameVita={renameVita} renameVisione={renameVisione} />
        )}
        {tab === 'pipeline' && (
          visioneSel ? <Pipeline viste={viste} onOpen={setVistaAperta} onAdd={() => addVista(false)} />
            : <Empty msg="Seleziona o crea una visione nei Mondi." />
        )}
        {tab === 'mappa' && (
          viste.length ? <MapView viste={viste} links={links} onOpen={setVistaAperta} onAddVista={addVista} onReparent={reparent} />
            : <Empty msg="Crea qualche vista per vedere la mappa." />
        )}
        {tab === 'livelli' && (
          viste.length ? <Levels viste={viste} links={links} onReparent={reparent} onOpen={setVistaAperta} />
            : <Empty msg="Crea qualche vista per organizzare i livelli." />
        )}
      </div>

      <Pomodoro focusMode={focusMode} onToggleFocus={() => setFocusMode(f => !f)} />

      {prompt && <NamePrompt data={prompt} onClose={() => setPrompt(null)} />}

      {themeOpen && (
        <div className="modal-bg" onClick={() => setThemeOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Tema dell'app</h3>
            <div className="theme-grid">
              {Object.entries(THEMES).map(([id, t]) => (
                <button key={id} className={'theme-opt' + (theme===id ? ' active' : '')}
                  onClick={() => chooseTheme(id)}>
                  <div className="theme-swatches">
                    <span style={{background:t.vars['--bg']}} />
                    <span style={{background:t.vars['--green-bright']}} />
                    <span style={{background:t.vars['--panel-2']}} />
                  </div>
                  <span>{t.emoji} {t.nome}</span>
                </button>
              ))}
            </div>
            <div className="row"><button className="btn" onClick={() => setThemeOpen(false)}>Fatto</button></div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-bg" onClick={() => setPreview(null)}>
          <div className="modal preview-modal" onClick={e => e.stopPropagation()}>
            <h3>{preview.titolo || 'Senza titolo'}</h3>
            <div className="preview-body">
              {(preview.blocchi || []).map(b => (
                <div key={b.id} className="preview-line">{b.text || ''}</div>
              ))}
              {!(preview.blocchi || []).length && <div style={{color:'var(--text-dim)'}}>Vista vuota.</div>}
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setPreview(null)}>Chiudi</button>
              <button className="btn" onClick={() => { const p = preview; setPreview(null); setVistaAperta(p) }}>Apri e modifica ✎</button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div className="modal-bg" onClick={() => setMenu(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Menu</h3>
            <div className="menu-list">
              <button onClick={() => { addVista(true); setMenu(false) }}>＋ Crea template</button>
              <button onClick={() => { setThemeOpen(true) }}>🎨 Tema dell'app</button>
              <button onClick={doExport} disabled={busy==='export'}>⬇ Esporta backup (JSON)</button>
              <label className="menu-import">
                ⬆ Importa backup (JSON)
                <input type="file" accept="application/json" style={{display:'none'}}
                  onChange={e => e.target.files[0] && doImport(e.target.files[0])} />
              </label>
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

function Worlds({ vite, visioni, viste, vitaSel, setVitaSel, visioneSel, setVisioneSel, onOpenVista, onPreviewVista, addVita, addVisione, addVista, renameVita, renameVisione }) {
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
            <button className="rename-btn" title="Rinomina" onClick={(e) => { e.stopPropagation(); renameVita(v) }}>✎</button>
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
              <div key={v.id} className="world-card" onClick={() => setVisioneSel(v)}
                style={{outline: visioneSel?.id===v.id ? '2px solid var(--green-bright)' : 'none'}}>
                <div className="swatch" style={{background:v.colore}} />
                <button className="rename-btn" title="Rinomina" onClick={(e) => { e.stopPropagation(); renameVisione(v) }}>✎</button>
                <h3>{v.titolo}</h3>
                <div className="count">tocca per vedere le viste</div>
              </div>
            ))}
            {!visioni.length && <Empty msg="Nessuna visione: creane una." />}
          </div>

          {visioneSel && (
            <>
              <div className="section-head">
                <h2>Viste di "{visioneSel.titolo}"</h2>
                <span className="crumb">fogli · note</span>
                <div className="spacer" />
                <button className="add-btn" onClick={() => addVista(false)}>＋ Nuova vista</button>
              </div>
              <div className="grid-worlds">
                {viste.map(v => (
                  <div key={v.id} className="world-card" onClick={() => onPreviewVista(v)}>
                    <h3>{v.titolo || 'Senza titolo'}</h3>
                    <div className="count">livello {v.livello || 0} · tocca per anteprima</div>
                  </div>
                ))}
                {!viste.length && <Empty msg="Nessuna vista: creane una." />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function NamePrompt({ data, onClose }) {
  const [val, setVal] = useState(data.valore || '')
  const ok = () => {
    const nome = val.trim()
    if (!nome) return
    data.onOk(nome)
    onClose()
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{data.titolo}</h3>
        <div className="field">
          <label>{data.label}</label>
          <input className="input" autoFocus value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') onClose() }}
            placeholder="Scrivi un nome…" />
        </div>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Annulla</button>
          <button className="btn" onClick={ok}>Conferma</button>
        </div>
      </div>
    </div>
  )
}

function Empty({ msg }) {
  return <div style={{padding:40,textAlign:'center',color:'var(--text-dim)'}}>{msg}</div>
}
