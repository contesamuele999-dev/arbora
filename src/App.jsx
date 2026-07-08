import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './lib/auth.jsx'
import { store } from './lib/store.js'
import Auth from './pages/Auth.jsx'
import Editor from './views/Editor.jsx'
import Pipeline from './views/Pipeline.jsx'
import Tree from './views/Tree.jsx'
import Progress from './views/Progress.jsx'
import Stats from './views/Stats.jsx'
import Profile from './views/Profile.jsx'
import Guide from './views/Guide.jsx'
import { Privacy, Terms } from './pages/Legal.jsx'
import { THEMES, applyTheme, loadTheme } from './lib/themes.js'
import { exportBackup, importBackup } from './lib/backup.js'
import { RenderedBlock } from './lib/markdown.jsx'
import { DEFAULT_STAGE } from './lib/stages.js'
import { cacheVistaLocal, markVistaSynced, mergeVisteWithCache, flushDirtyToCloud, cestinoDisabled, disableCestinoCloud, isMissingCestino } from './lib/localcache.js'

const TABS = [
  { id: 'pipe', label: 'Pipe' },
  { id: 'tree', label: 'Tree' },
  { id: 'progress', label: 'Progress' },
]

export default function App() {
  const { user, loading, signOut, isDemo } = useAuth()
  const [tab, setTab] = useState('pipe')
  const [tabDir, setTabDir] = useState(0)      // -1 sx, +1 dx (per l'animazione swipe)
  const [visioni, setVisioni] = useState([])
  const [viste, setViste] = useState([])
  const [links, setLinks] = useState([])
  const [vistaAperta, setVistaAperta] = useState(null)
  const [focusMode, setFocusMode] = useState(false)
  const [page, setPage] = useState(null)       // 'privacy' | 'terms' | 'profile' | 'stats'
  const [guide, setGuide] = useState(null)     // sezione della guida
  const [menu, setMenu] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [theme, setTheme] = useState('foresta')
  const [themeOpen, setThemeOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const defaultVita = useRef(null)
  const stageWarned = useRef(false)

  const reload = useCallback(async () => {
    // resiliente: se una singola query fallisce non azzeriamo tutta l'app
    const safe = (p) => p.catch(e => { console.warn('[reload] lettura fallita:', e?.message || e); return [] })
    const [vt, vs, allViste, allLinks] = await Promise.all([
      safe(store.list('vite')), safe(store.list('visioni')), safe(store.list('viste')), safe(store.list('links')),
    ])
    defaultVita.current = vt[0] || null
    setVisioni(vs)
    const merged = mergeVisteWithCache(allViste)   // ripristina modifiche locali non ancora confermate
    setViste(merged)
    const ids = new Set(merged.map(v => v.id))
    setLinks(allLinks.filter(l => ids.has(l.da_vista) && ids.has(l.a_vista)))
    flushDirtyToCloud(store)   // ri-spedisce in background ciò che non era stato salvato sul cloud
  }, [])

  useEffect(() => { setTheme(loadTheme()) }, [])
  useEffect(() => { if (user) reload() }, [user, reload])

  // ---- tasto INDIETRO (mobile): chiude l'overlay in cima invece di uscire dall'app ----
  const overlaysRef = useRef([])
  overlaysRef.current = [
    confirm && (() => setConfirm(null)),
    prompt && (() => setPrompt(null)),
    fabOpen && (() => setFabOpen(false)),
    themeOpen && (() => setThemeOpen(false)),
    preview && (() => setPreview(null)),
    guide && (() => setGuide(null)),
    menu && (() => setMenu(false)),
    page && (() => setPage(null)),
    vistaAperta && (() => setVistaAperta(null)),
  ].filter(Boolean)

  useEffect(() => {
    window.history.pushState({ arbora: true }, '')
    const onPop = () => {
      const top = overlaysRef.current[0]
      if (top) { top(); window.history.pushState({ arbora: true }, '') }
      // se non c'è nulla da chiudere lasciamo procedere (comportamento nativo)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ---- swipe fra le schede ----
  const changeTab = (next, dir) => { setTabDir(dir); setTab(next) }
  const swipe = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
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
      if (el.scrollLeft !== s.sl) return
      const atStart = el.scrollLeft <= 1
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((dx > 0 && !atStart) || (dx < 0 && !atEnd)) return
    }
    const idx = TABS.findIndex(x => x.id === tab)
    const next = dx < 0 ? idx + 1 : idx - 1
    if (next >= 0 && next < TABS.length) changeTab(TABS[next].id, dx < 0 ? 1 : -1)
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

  // ---- Eliminazione rapida (con conferma) ----
  const deleteVista = (vista) => {
    setConfirm({
      titolo: 'Eliminare la vista?',
      messaggio: `"${vista.titolo || 'Senza titolo'}" verrà eliminata definitivamente.`,
      okLabel: 'Elimina',
      onOk: async () => {
        const childIds = viste.filter(v => v.parent_id === vista.id).map(v => v.id)
        const badLinks = links.filter(l => l.da_vista === vista.id || l.a_vista === vista.id).map(l => l.id)
        try {
          await store.remove('viste', vista.id)
          for (const cid of childIds) { try { await store.update('viste', cid, { parent_id: null }) } catch {} }
          for (const lid of badLinks) { try { await store.remove('links', lid) } catch {} }
        } catch (e) { alert('Errore eliminazione: ' + (e?.message || e)); return }
        setViste(vs => vs.filter(v => v.id !== vista.id).map(v => v.parent_id === vista.id ? { ...v, parent_id: null } : v))
        setLinks(ls => ls.filter(l => l.da_vista !== vista.id && l.a_vista !== vista.id))
        if (vistaAperta?.id === vista.id) setVistaAperta(null)
      },
    })
  }

  const deleteVisione = (vis) => {
    const mie = viste.filter(v => v.visione_id === vis.id)
    const mieIds = new Set(mie.map(v => v.id))
    setConfirm({
      titolo: 'Eliminare la visione?',
      messaggio: mie.length
        ? `"${vis.titolo}" e le sue ${mie.length} vist${mie.length === 1 ? 'a' : 'e'} verranno eliminate definitivamente.`
        : `"${vis.titolo}" verrà eliminata definitivamente.`,
      okLabel: 'Elimina tutto',
      onOk: async () => {
        const badLinks = links.filter(l => mieIds.has(l.da_vista) || mieIds.has(l.a_vista)).map(l => l.id)
        try {
          await store.remove('visioni', vis.id)          // cloud: cascade su viste e links
          for (const v of mie) { try { await store.remove('viste', v.id) } catch {} }   // demo/cleanup
          for (const lid of badLinks) { try { await store.remove('links', lid) } catch {} }
        } catch (e) { alert('Errore eliminazione: ' + (e?.message || e)); return }
        setViste(vs => vs.filter(v => v.visione_id !== vis.id))
        setVisioni(vs => vs.filter(v => v.id !== vis.id))
        setLinks(ls => ls.filter(l => !mieIds.has(l.da_vista) && !mieIds.has(l.a_vista)))
        if (vistaAperta && mieIds.has(vistaAperta.id)) setVistaAperta(null)
      },
    })
  }

  const saveVista = async (updated) => {
    // 1) mirror SINCRONO in locale: sopravvive a refresh/chiusura anche se il cloud fallisce
    cacheVistaLocal(updated.id, { titolo: updated.titolo, blocchi: updated.blocchi, ...(updated.cestino !== undefined ? { cestino: updated.cestino } : {}) })
    // 2) aggiornamento ottimistico della UI
    setViste(vs => vs.map(v => v.id === updated.id ? { ...v, ...updated } : v))
    setVistaAperta(va => (va && va.id === updated.id) ? { ...va, ...updated } : va)
    // 3) salvataggio cloud (best-effort, con fallback se la colonna cestino non esiste)
    const patch = { titolo: updated.titolo, blocchi: updated.blocchi }
    if (updated.cestino !== undefined && !cestinoDisabled()) patch.cestino = updated.cestino
    try {
      await store.update('viste', updated.id, patch)
      markVistaSynced(updated.id)
      return 'cloud'
    } catch (e) {
      if (isMissingCestino(e) && updated.cestino !== undefined) {
        disableCestinoCloud()
        try {
          await store.update('viste', updated.id, { titolo: updated.titolo, blocchi: updated.blocchi })
          markVistaSynced(updated.id)   // testo salvato; il cestino resta in cache locale
          return 'cloud'
        } catch (e2) { console.warn('Salvataggio cloud fallito (conservato in locale):', e2) }
      } else {
        console.warn('Salvataggio cloud fallito (conservato in locale):', e)
      }
      return 'local'   // il dato è comunque al sicuro in localStorage
    }
  }

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
  const pageTitles = { privacy: 'Privacy', terms: 'Termini e condizioni', profile: 'Profilo', stats: 'Statistiche' }

  // ---------- Pagine a schermo intero (profilo, statistiche, legali) ----------
  if (page) {
    return (
      <div className="app">
        <div className="topbar">
          <button className="iconbtn" onClick={() => setPage(null)}>←</button>
          <div className="brand"><span>{pageTitles[page]}</span></div>
          <div className="spacer" />
        </div>
        <div className="content">
          {page === 'privacy' && <Privacy />}
          {page === 'terms' && <Terms />}
          {page === 'profile' && <Profile />}
          {page === 'stats' && <Stats viste={visteConFasi} />}
        </div>
      </div>
    )
  }

  // ---------- Editor di una vista ----------
  if (vistaAperta) {
    return (
      <div className="app">
        <div className="topbar">
          <button className="iconbtn" onClick={() => setVistaAperta(null)}>←</button>
          <div className="brand"><span>{visioni.find(v => v.id === vistaAperta.visione_id)?.titolo}</span></div>
          <div className="spacer" />
          <button className="iconbtn" title="Guida" onClick={() => setGuide('editor')}>?</button>
          <button className="iconbtn" title="Focus" onClick={() => setFocusMode(f => !f)}>{focusMode ? '🔅' : '🎯'}</button>
        </div>
        <div className="content">
          <Editor vista={vistaAperta} onChange={saveVista} onWikilink={openByName} focusMode={focusMode} allViste={viste} />
        </div>
        {prompt && <NamePrompt data={prompt} onClose={() => setPrompt(null)} />}
        {guide && <GuideModal section={guide} onClose={() => setGuide(null)} />}
      </div>
    )
  }

  // ---------- Vista principale a schede ----------
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><BrandLogo /><span>Arbora</span></div>
        <div className="spacer" />
        <div className="tabs">
          {TABS.map((t, i) => {
            const cur = TABS.findIndex(x => x.id === tab)
            return (
              <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')}
                onClick={() => changeTab(t.id, i > cur ? 1 : -1)}>{t.label}</button>
            )
          })}
        </div>
        <div className="spacer" />
        <button className="iconbtn" title="Guida" onClick={() => setGuide(tab)}>?</button>
        <button className="iconbtn" onClick={() => setMenu(true)}>☰</button>
      </div>

      <div className="content" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div key={tab} className={'tab-pane ' + (tabDir < 0 ? 'from-left' : tabDir > 0 ? 'from-right' : '')}>
          {tab === 'pipe' && (
            <Pipeline visioni={visioni} viste={visteConFasi}
              onOpen={setVistaAperta} onPreview={setPreview}
              onAddVisione={addVisione} onAddVista={(visioneId) => addVista({ visioneId })}
              onRenameVisione={renameVisione} onRecolorVisione={recolorVisione}
              onDeleteVista={deleteVista} onDeleteVisione={deleteVisione} />
          )}
          {tab === 'tree' && (
            viste.length
              ? <Tree viste={visteConFasi} visioni={visioni} onOpen={setVistaAperta}
                  onAddChild={(parent) => addVista({ parent })} onReparent={reparent} onQuickSave={saveVista} />
              : <Empty msg="Crea qualche vista in Pipe per vedere l'albero." />
          )}
          {tab === 'progress' && (
            <Progress viste={visteConFasi} onOpen={setVistaAperta} onSetStage={setStage} />
          )}
        </div>
      </div>

      {/* FAB: creazione rapida di visioni/viste */}
      <div className="fab-wrap">
        {fabOpen && (
          <div className="fab-menu">
            <button onClick={() => { setFabOpen(false); addVisione() }}>🌱 Nuova visione</button>
            <button onClick={() => { setFabOpen(false); addVista({}) }}>📄 Nuova vista</button>
          </div>
        )}
        <button className={'fab' + (fabOpen ? ' open' : '')} title="Crea"
          onClick={() => setFabOpen(o => !o)}>＋</button>
      </div>
      {fabOpen && <div className="fab-scrim" onClick={() => setFabOpen(false)} />}

      {prompt && <NamePrompt data={prompt} onClose={() => setPrompt(null)} />}
      {confirm && <ConfirmModal data={confirm} onClose={() => setConfirm(null)} />}
      {guide && <GuideModal section={guide} onClose={() => setGuide(null)} />}

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
                <div key={b.id} className="preview-line" style={{ marginLeft: (b.indent || 0) * 18 }}>
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
              <button onClick={() => { setMenu(false); setPage('profile') }}>👤 Profilo</button>
              <button onClick={() => { setMenu(false); setPage('stats') }}>📊 Statistiche</button>
              <button onClick={() => { setMenu(false); setGuide(tab) }}>❓ Guida comandi</button>
              <button onClick={() => { setMenu(false); setThemeOpen(true) }}>🎨 Tema dell'app</button>
              <button onClick={doExport} disabled={busy==='export'}>⬇ Esporta backup (JSON)</button>
              <label className="menu-import">
                ⬆ Importa backup (JSON)
                <input type="file" accept="application/json" style={{display:'none'}}
                  onChange={e => e.target.files[0] && doImport(e.target.files[0])} />
              </label>
              <button onClick={() => { setPage('privacy'); setMenu(false) }}>Privacy</button>
              <button onClick={() => { setPage('terms'); setMenu(false) }}>Termini e condizioni</button>
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

function GuideModal({ section, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <Guide section={section} />
        <div className="row"><button className="btn" onClick={onClose}>Ho capito</button></div>
      </div>
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

function ConfirmModal({ data, onClose }) {
  const ok = async () => { await data.onOk(); onClose() }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{data.titolo}</h3>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 0 4px' }}>{data.messaggio}</p>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Annulla</button>
          <button className="btn danger" onClick={ok}>{data.okLabel || 'Elimina'}</button>
        </div>
      </div>
    </div>
  )
}

function Empty({ msg }) {
  return <div style={{padding:40,textAlign:'center',color:'var(--text-dim)'}}>{msg}</div>
}

// Logo Arbora inline: usa le variabili CSS del tema (cambia colore col tema).
function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--panel-2)" stroke="var(--border)" strokeWidth="6" />
      <g stroke="var(--green)" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M256 392 L256 300" />
        <path d="M256 300 L160 220" />
        <path d="M256 300 L352 220" />
        <path d="M160 220 L112 150" />
        <path d="M160 220 L208 150" />
        <path d="M352 220 L304 150" />
        <path d="M352 220 L400 150" />
      </g>
      <circle cx="256" cy="408" r="30" fill="var(--green-deep)" />
      <circle cx="256" cy="300" r="22" fill="var(--green)" />
      <circle cx="160" cy="220" r="20" fill="var(--green)" />
      <circle cx="352" cy="220" r="20" fill="var(--green)" />
      <circle cx="112" cy="150" r="18" fill="var(--green-bright)" />
      <circle cx="208" cy="150" r="18" fill="var(--green-bright)" />
      <circle cx="304" cy="150" r="18" fill="var(--green-bright)" />
      <circle cx="400" cy="150" r="18" fill="var(--green-bright)" />
    </svg>
  )
}
