import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './lib/auth.jsx'
import { store } from './lib/store.js'
import Auth from './pages/Auth.jsx'
import Editor from './views/Editor.jsx'
import Pipeline from './views/Pipeline.jsx'
import Tree from './views/Tree.jsx'
import Progress from './views/Progress.jsx'
import Pomodoro from './views/Pomodoro.jsx'
import { Privacy, Terms } from './pages/Legal.jsx'
import { THEMES, applyTheme, loadTheme } from './lib/themes.js'
import { exportBackup, importBackup } from './lib/backup.js'
import { RenderedBlock } from './lib/markdown.jsx'
import { DEFAULT_STAGE } from './lib/stages.js'

const TABS = [
  { id: 'pipe', label: 'Pipe' },
  { id: 'tree', label: 'Tree' },
  { id: 'progress', label: 'Progress' },
]

export default function App() {
  const { user, loading, signOut, isDemo } = useAuth()
  const [tab, setTab] = useState('pipe')
  const [visioni, setVisioni] = useState([])
  const [viste, setViste] = useState([])
  const [links, setLinks] = useState([])
  const [vistaAperta, setVistaAperta] = useState(null)
  const [focusMode, setFocusMode] = useState(false)
  const [legal, setLegal] = useState(null)
  const [menu, setMenu] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [theme, setTheme] = useState('foresta')
  const [themeOpen, setThemeOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const defaultVita = useRef(null)   // vita "silente": serve solo al DB, non è più esposta in UI
  const stageWarned = useRef(false)

  const reload = useCallback(async () => {
    const [vt, vs, allViste, allLinks] = await Promise.all([
      store.list('vite'), store.list('visioni'), store.list('viste'), store.list('links'),
    ])
    defaultVita.current = vt[0] || null
    setVisioni(vs)
    setViste(allViste)
    const ids = new Set(allViste.map(v => v.id))
    setLinks(allLinks.filter(l => ids.has(l.da_vista) && ids.has(l.a_vista)))
  }, [])

  useEffect(() => { setTheme(loadTheme()) }, [])
  useEffect(() => { if (user) reload() }, [user, reload])

  // ---- swipe fra le schede ----
  const swipe = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    // niente swipe se il gesto parte da un'area che gestisce il pan/scroll orizzontale
    const noswipe = e.target.closest('[data-noswipe]')
    let scroller = null
    if (noswipe?.dataset?.noswipe === 'scroll') scroller = noswipe
    swipe.current = { x: t.clientX, y: t.clientY, blocked: noswipe && !scroller, scroller, sl: scroller?.scrollLeft ?? 0 }
  }
  const onTouchEnd = (e) => {
    const s = swipe.current; swipe.current = null
    if (!s || s.blocked || vistaAperta) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) < 70 || Math.abs(dy) > 60 || Math.abs(dx) < Math.abs(dy)) return
    if (s.scroller) {
      const el = s.scroller
      if (el.scrollLeft !== s.sl) return                                   // lo scroller ha consumato il gesto
      const atStart = el.scrollLeft <= 1
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((dx > 0 && !atStart) || (dx < 0 && !atEnd)) return               // può ancora scorrere
    }
    const idx = TABS.findIndex(x => x.id === tab)
    const next = dx < 0 ? idx + 1 : idx - 1
    if (next >= 0 && next < TABS.length) setTab(TABS[next].id)
  }

  if (loading) return <div style={{display:'grid',placeItems:'center',height:'100dvh'}}>Caricamento…</div>
  if (!user) return <Auth />

  const ensureVita = async () => {
    if (defaultVita.current) return defaultVita.current
    const v = await store.insert('vite', { titolo: 'Arbora', colore: '#1f7a4d', ordine: 0 })
    defaultVita.current = v
    return v
  }

  const addVisione = () => {
    setPrompt({ titolo: 'Nuova visione', label: 'Nome della visione', valore: '', onOk: async (nome) => {
      const vita = await ensureVita()
      const v = await store.insert('visioni', { vita_id: vita.id, titolo: nome, colore: '#2e9e63', ordine: visioni.length })
      setVisioni(prev => [...prev, v])
    }})
  }

  // Crea una vista. parent: vista genitore (Tree) → crea anche il link.
  const addVista = ({ visioneId, parent = null, open = false } = {}) => {
    const vid = visioneId || parent?.visione_id || visioni[0]?.id
    if (!vid) { alert('Crea prima una visione.'); return }
    setPrompt({ titolo: 'Nuova vista', label: 'Titolo della vista', valore: '', onOk: async (nome) => {
      const v = await store.insert('viste', {
        visione_id: vid, titolo: nome, blocchi: [{ id: 'b1', text: '' }],
        is_template: false, livello: parent ? (parent.livello || 0) + 1 : 0,
        parent_id: parent?.id || null, pos_x: 0, pos_y: 0, ordine: viste.length,
      })
      setViste(prev => [...prev, v])
      if (parent) {
        const lk = await store.insert('links', { da_vista: parent.id, a_vista: v.id, tipo: 'maggiore' })
        setLinks(ls => [...ls, lk])
      }
      if (open) setVistaAperta(v)
    }})
  }

  const renameVisione = (visione) => {
    setPrompt({ titolo: 'Rinomina visione', label: 'Nome della visione', valore: visione.titolo, onOk: async (nome) => {
      await store.update('visioni', visione.id, { titolo: nome })
      setVisioni(prev => prev.map(v => v.id === visione.id ? { ...v, titolo: nome } : v))
    }})
  }

  const recolorVisione = async (visione, colore) => {
    await store.update('visioni', visione.id, { colore })
    setVisioni(prev => prev.map(v => v.id === visione.id ? { ...v, colore } : v))
  }

  const saveVista = async (updated) => {
    await store.update('viste', updated.id, { titolo: updated.titolo, blocchi: updated.blocchi })
    setViste(vs => vs.map(v => v.id === updated.id ? { ...v, ...updated } : v))
    if (vistaAperta?.id === updated.id) setVistaAperta({ ...vistaAperta, ...updated })
  }

  // Cambia fase (bacheca Progress). Fallback locale se manca la colonna "stage" nel DB.
  const setStage = async (vistaId, stage) => {
    setViste(vs => vs.map(v => v.id === vistaId ? { ...v, stage } : v))
    try {
      await store.update('viste', vistaId, { stage })
    } catch (e) {
      const map = JSON.parse(localStorage.getItem('arbora-stages') || '{}')
      map[vistaId] = stage
      localStorage.setItem('arbora-stages', JSON.stringify(map))
      if (!stageWarned.current) {
        stageWarned.current = true
        alert('Per sincronizzare le fasi sul cloud esegui su Supabase:\nALTER TABLE public.viste ADD COLUMN IF NOT EXISTS stage text DEFAULT \'' + DEFAULT_STAGE + '\';\n(Nel frattempo le fasi sono salvate solo su questo dispositivo.)')
      }
    }
  }

  // Applica eventuali fasi salvate localmente (fallback)
  const withLocalStages = (vs) => {
    const map = JSON.parse(localStorage.getItem('arbora-stages') || '{}')
    return vs.map(v => (v.stage == null && map[v.id]) ? { ...v, stage: map[v.id] } : v)
  }

  const openByName = async (name) => {
    let target = viste.find(v => (v.titolo || '').toLowerCase() === name.toLowerCase())
    if (!target) {
      const vid = vistaAperta?.visione_id || visioni[0]?.id
      if (!vid) return
      target = await store.insert('viste', { visione_id: vid, titolo: name, blocchi: [{id:'b1',text:''}], livello: (vistaAperta?.livello||0)+1, parent_id: vistaAperta?.id||null, pos_x: 0, pos_y: 0, ordine: viste.length })
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
    setBusy('export')
    try { await exportBackup() } finally { setBusy(''); setMenu(false) }
  }
  const doImport = async (file) => {
    setBusy('import')
    try {
      await importBackup(file)
      await reload()
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

  const visteConFasi = withLocalStages(viste)

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
          <div className="brand"><span>{visioni.find(v => v.id === vistaAperta.visione_id)?.titolo}</span></div>
          <div className="spacer" />
          <button className="iconbtn" title="Focus" onClick={() => setFocusMode(f => !f)}>{focusMode ? '🔅' : '🎯'}</button>
        </div>
        <div className="content">
          <Editor vista={vistaAperta} onChange={saveVista} onWikilink={openByName} focusMode={focusMode} allViste={viste} />
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

      <div className="content" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === 'pipe' && (
          <Pipeline visioni={visioni} viste={visteConFasi}
            onOpen={setVistaAperta} onPreview={setPreview}
            onAddVisione={addVisione} onAddVista={(visioneId) => addVista({ visioneId })}
            onRenameVisione={renameVisione} onRecolorVisione={recolorVisione} />
        )}
        {tab === 'tree' && (
          viste.length
            ? <Tree viste={visteConFasi} visioni={visioni} onOpen={setVistaAperta}
                onAddChild={(parent) => addVista({ parent })} onReparent={reparent} />
            : <Empty msg="Crea qualche vista in Pipe per vedere l'albero." />
        )}
        {tab === 'progress' && (
          <Progress viste={visteConFasi} onOpen={setVistaAperta} onSetStage={setStage} />
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
            <div className="preview-body rendered">
              {(preview.blocchi || []).map(b => (
                <div key={b.id} className="preview-line">
                  {b.text ? <RenderedBlock text={b.text} /> : ''}
                </div>
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
              <button onClick={() => { setMenu(false); setThemeOpen(true) }}>🎨 Tema dell'app</button>
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
