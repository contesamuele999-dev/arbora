import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './lib/auth.jsx'
import { store } from './lib/store.js'
import Auth from './pages/Auth.jsx'
import Editor from './views/Editor.jsx'
import Pipeline from './views/Pipeline.jsx'
import Tree from './views/Tree.jsx'
import Links from './views/Links.jsx'
import Progress from './views/Progress.jsx'
import Stats from './views/Stats.jsx'
import Profile from './views/Profile.jsx'
import Guide from './views/Guide.jsx'
import { Privacy, Terms } from './pages/Legal.jsx'
import { THEMES, applyTheme, loadTheme } from './lib/themes.js'
import { exportBackup, importBackup } from './lib/backup.js'
import { importGoogleKeep } from './lib/keepImport.js'
import { RenderedBlock } from './lib/markdown.jsx'
import { DEFAULT_STAGE } from './lib/stages.js'
import { cacheVistaLocal, markVistaSynced, mergeVisteWithCache, flushDirtyToCloud, cestinoDisabled, disableCestinoCloud, isMissingCestino } from './lib/localcache.js'

const TABS = [
  { id: 'pipe', label: 'Pipe' },
  { id: 'tree', label: 'Tree' },
  { id: 'links', label: 'Links' },
  { id: 'progress', label: 'Progress' },
]

export default function App() {
  const { user, loading, signOut, isDemo } = useAuth()
  const [tab, setTab] = useState('pipe')
  const [tabDir, setTabDir] = useState(0)      // -1 sx, +1 dx (per l'animazione swipe)
  const [swipeHint, setSwipeHint] = useState(null)   // { scope, dir, ready, label } feedback live durante lo swipe
  const swipeHintRef = useRef('')
  const [pipeQuery, setPipeQuery] = useState('')   // ricerca Pipe sollevata qui: sopravvive all'apertura di una vista.
  const [visioni, setVisioni] = useState([])
  const [viste, setViste] = useState([])
  const [links, setLinks] = useState([])
  const [vistaAperta, setVistaAperta] = useState(null)
  const [vistaStack, setVistaStack] = useState([])   // storia delle viste aperte via link/ricerca (per il tasto ←)
  const [jumpText, setJumpText] = useState(null)     // termine cercato: la vista aperta scrolla alla riga che lo contiene
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
  const pinWarned = useRef(false)
  const contentRef = useRef(null)       // contenitore scrollabile delle schede (Pipe/Tree/…)
  const pipeScrollRef = useRef(0)       // scroll di Pipe salvato all'apertura di una vista, ripristinato al ritorno
  const baseBlocchi = useRef({})        // { vistaId: blocchi } = ultimo stato cloud noto, per il merge multi-dispositivo

  const reload = useCallback(async () => {
    // resiliente: se una singola query fallisce non azzeriamo tutta l'app
    const safe = (p) => p.catch(e => { console.warn('[reload] lettura fallita:', e?.message || e); return [] })
    const [vt, vs, allViste, allLinks] = await Promise.all([
      safe(store.list('vite')), safe(store.list('visioni')), safe(store.list('viste')), safe(store.list('links')),
    ])
    defaultVita.current = vt[0] || null
    setVisioni(vs)
    // istantanea dello stato cloud: base per il merge a 3 vie al prossimo salvataggio
    baseBlocchi.current = Object.fromEntries(allViste.map(v => [v.id, v.blocchi || []]))
    const merged = mergeVisteWithCache(allViste)   // ripristina modifiche locali non ancora confermate
    setViste(merged)
    const ids = new Set(merged.map(v => v.id))
    setLinks(allLinks.filter(l => ids.has(l.da_vista) && ids.has(l.a_vista)))
    flushDirtyToCloud(store)   // ri-spedisce in background ciò che non era stato salvato sul cloud
  }, [])

  useEffect(() => { setTheme(loadTheme()) }, [])
  useEffect(() => { if (user) reload() }, [user, reload])

  // ripristina lo scroll di Pipe quando si chiude una vista e si torna all'elenco
  useLayoutEffect(() => {
    if (!vistaAperta && !page && tab === 'pipe' && contentRef.current) {
      contentRef.current.scrollTop = pipeScrollRef.current
    }
  }, [vistaAperta, page, tab])

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
    vistaAperta && (() => closeVista()),
    // in Pipe con una ricerca attiva: il back cancella prima la ricerca (utile su tablet)
    (!vistaAperta && !page && tab === 'pipe' && pipeQuery) && (() => setPipeQuery('')),
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
  const editSwipe = useRef(null)   // swipe fra viste dentro l'editor
  // aggiorna l'indicatore di swipe solo quando cambia davvero (evita re-render inutili)
  const showSwipeHint = (h) => {
    const sig = h ? `${h.scope}|${h.dir}|${h.ready ? 1 : 0}|${h.label}` : ''
    if (sig === swipeHintRef.current) return
    swipeHintRef.current = sig
    setSwipeHint(h)
  }
  const onTouchStart = (e) => {
    const t = e.touches[0]
    const noswipe = e.target.closest('[data-noswipe]')
    let scroller = null
    if (noswipe?.dataset?.noswipe === 'scroll') scroller = noswipe
    swipe.current = { x: t.clientX, y: t.clientY, blocked: noswipe && !scroller, scroller, sl: scroller?.scrollLeft ?? 0 }
  }
  // feedback live: mentre trascini in orizzontale mostra dove stai per andare
  const onTouchMove = (e) => {
    const s = swipe.current
    if (!s || s.blocked || vistaAperta) return
    const t = e.touches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) < 20 || Math.abs(dx) < Math.abs(dy)) { showSwipeHint(null); return }
    if (s.scroller) {
      const el = s.scroller
      const atStart = el.scrollLeft <= 1
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((dx > 0 && !atStart) || (dx < 0 && !atEnd)) { showSwipeHint(null); return }
    }
    const idx = TABS.findIndex(x => x.id === tab)
    const next = dx < 0 ? idx + 1 : idx - 1
    if (next < 0 || next >= TABS.length) { showSwipeHint(null); return }
    showSwipeHint({ scope: 'tab', dir: dx < 0 ? 1 : -1, ready: Math.abs(dx) >= 70 && Math.abs(dy) <= 60, label: TABS[next].label })
  }
  const onTouchEnd = (e) => {
    const s = swipe.current; swipe.current = null
    showSwipeHint(null)
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

  // drag & drop per riordinare le visioni in Pipe (edge: 'before' | 'after' rispetto al bersaglio)
  const reorderVisioni = async (draggedId, targetId, edge = 'before') => {
    if (draggedId === targetId) return
    const arr = [...visioni]
    const from = arr.findIndex(v => v.id === draggedId)
    if (from === -1) return
    const [item] = arr.splice(from, 1)
    const to = arr.findIndex(v => v.id === targetId)
    if (to === -1) return
    arr.splice(edge === 'after' ? to + 1 : to, 0, item)
    const before = new Map(visioni.map(v => [v.id, v.ordine]))
    const withOrdine = arr.map((v, i) => ({ ...v, ordine: i }))
    setVisioni(withOrdine)
    for (const v of withOrdine) {
      if (before.get(v.id) !== v.ordine) { try { await store.update('visioni', v.id, { ordine: v.ordine }) } catch {} }
    }
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
    // 2) aggiornamento ottimistico della UI (aggiorna anche updated_at così Pipe
    //    riordina subito per modifica più recente, senza attendere il reload dal cloud)
    const nowIso = new Date().toISOString()
    setViste(vs => vs.map(v => v.id === updated.id ? { ...v, ...updated, updated_at: nowIso } : v))
    setVistaAperta(va => (va && va.id === updated.id) ? { ...va, ...updated, updated_at: nowIso } : va)
    // 3) salvataggio cloud con MERGE per riga: rilegge la versione cloud e fonde i
    //    blocchi per id, così le modifiche fatte in contemporanea su un altro
    //    dispositivo non vengono sovrascritte. (best-effort, fallback se manca `cestino`)
    const base = baseBlocchi.current[updated.id]
    const patch = { titolo: updated.titolo, blocchi: updated.blocchi }
    if (updated.cestino !== undefined && !cestinoDisabled()) patch.cestino = updated.cestino
    const applyMerged = (saved) => {
      // allinea base + UI al risultato del merge (può contenere righe di un altro dispositivo)
      const mb = saved?.blocchi
      if (Array.isArray(mb)) {
        baseBlocchi.current[updated.id] = mb
        setViste(vs => vs.map(v => v.id === updated.id ? { ...v, blocchi: mb } : v))
        setVistaAperta(va => (va && va.id === updated.id) ? { ...va, blocchi: mb } : va)
      } else {
        baseBlocchi.current[updated.id] = updated.blocchi
      }
    }
    try {
      const saved = await store.updateVistaMerged(updated.id, patch, base)
      applyMerged(saved)
      markVistaSynced(updated.id)
      return 'cloud'
    } catch (e) {
      if (isMissingCestino(e) && updated.cestino !== undefined) {
        disableCestinoCloud()
        try {
          const saved = await store.updateVistaMerged(updated.id, { titolo: updated.titolo, blocchi: updated.blocchi }, base)
          applyMerged(saved)
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
    // aggiorna anche la vista aperta: senza questo, il pill della fase nella
    // schermata di modifica restava con l'etichetta vecchia (sembrava "non funzionare").
    setVistaAperta(va => (va && va.id === vistaId) ? { ...va, stage } : va)
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

  // ---- Pin: fissa una vista in cima alla sua visione (Pipe). Sincronizzato sul cloud
  //      con la colonna `pinned`; se la colonna non esiste ancora, fallback su questo
  //      dispositivo (localStorage) con avviso una tantum + script SQL da eseguire. ----
  const setPinned = async (vistaId, pinned) => {
    setViste(vs => vs.map(v => v.id === vistaId ? { ...v, pinned } : v))
    setVistaAperta(va => (va && va.id === vistaId) ? { ...va, pinned } : va)
    try {
      await store.update('viste', vistaId, { pinned })
    } catch (e) {
      const map = JSON.parse(localStorage.getItem('arbora-pins') || '{}')
      if (pinned) map[vistaId] = true; else delete map[vistaId]
      localStorage.setItem('arbora-pins', JSON.stringify(map))
      if (!pinWarned.current) {
        pinWarned.current = true
        alert('Per sincronizzare le viste fissate sul cloud esegui su Supabase:\nALTER TABLE public.viste ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;\n(Nel frattempo i "fissati" sono salvati solo su questo dispositivo.)')
      }
    }
  }

  const withLocalPins = (vs) => {
    const map = JSON.parse(localStorage.getItem('arbora-pins') || '{}')
    return vs.map(v => (v.pinned == null && map[v.id]) ? { ...v, pinned: true } : v)
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
    // apertura via wikilink: registra la vista corrente per poter tornare indietro
    if (vistaAperta && vistaAperta.id !== target.id) setVistaStack(s => [...s, vistaAperta])
    setVistaAperta(target)
  }

  // apre una vista partendo dall'elenco (Pipe/Tree/Links/Progress): azzera la storia.
  // Salva lo scroll di Pipe così, al ritorno, si riparte dallo stesso punto.
  const openFromList = (v) => {
    if (tab === 'pipe' && contentRef.current) pipeScrollRef.current = contentRef.current.scrollTop
    setJumpText(null); setVistaStack([]); setVistaAperta(v)
  }
  // naviga a un'altra vista da dentro l'editor (ricerca "vai a"): impila quella corrente.
  // `term` (opzionale) = testo cercato: la vista aperta scrolla alla riga che lo contiene.
  const pushVista = (v, term = null) => {
    setJumpText(term || null)
    setVistaAperta(cur => { if (cur && cur.id !== v.id) setVistaStack(s => [...s, cur]); return v })
  }
  // tasto ← / back: se sei arrivato qui da un link torna alla vista precedente, altrimenti chiudi
  const closeVista = () => {
    setJumpText(null)
    setVistaStack(s => {
      if (s.length) { setVistaAperta(s[s.length - 1]); return s.slice(0, -1) }
      setVistaAperta(null); return s
    })
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
  const doImportKeep = async (files) => {
    if (!files?.length) return
    setBusy('keep')
    try {
      const res = await importGoogleKeep(files)
      await reload()
      alert(`Importazione da Google Keep completata: ${res.imported} note importate` + (res.skipped ? `, ${res.skipped} saltate (cestino)` : '') + `.\nTrovi le note nella visione "Google Keep" appena creata.`)
    } catch (e) {
      alert('Errore import Google Keep: ' + (e?.message || e))
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

  // sposta una vista sotto un'altra VISIONE (diventa vista radice di quella visione)
  const moveVistaToVisione = async (childId, visioneId) => {
    const badLinks = links.filter(l => l.a_vista === childId && l.tipo === 'maggiore').map(l => l.id)
    try {
      await store.update('viste', childId, { visione_id: visioneId, parent_id: null, livello: 0 })
      for (const lid of badLinks) { try { await store.remove('links', lid) } catch {} }
    } catch (e) { alert('Errore spostamento: ' + (e?.message || e)); return }
    setViste(vs => vs.map(v => v.id === childId ? { ...v, visione_id: visioneId, parent_id: null, livello: 0 } : v))
    setLinks(ls => ls.filter(l => !(l.a_vista === childId && l.tipo === 'maggiore')))
  }

  // ---- swipe fra viste (dentro l'editor): passa alla vista prec/succ della stessa visione ----
  const adjacentVista = (dir) => {
    if (!vistaAperta) return null
    const sibs = viste
      .filter(v => v.visione_id === vistaAperta.visione_id && !v.is_template)
      .sort((a, b) => (a.ordine || 0) - (b.ordine || 0))
    const i = sibs.findIndex(v => v.id === vistaAperta.id)
    if (i === -1) return null
    const j = i + dir
    return (j >= 0 && j < sibs.length) ? sibs[j] : null
  }
  const openAdjacentVista = (dir) => { const t = adjacentVista(dir); if (t) setVistaAperta(t) }
  const onEditorTouchStart = (e) => {
    if (e.touches.length !== 1 || e.target.closest('textarea, input, [data-noswipe]')) { editSwipe.current = null; return }
    const t = e.touches[0]
    editSwipe.current = { x: t.clientX, y: t.clientY }
  }
  const onEditorTouchMove = (e) => {
    const s = editSwipe.current
    if (!s) { showSwipeHint(null); return }
    const t = e.touches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy) * 1.5) { showSwipeHint(null); return }
    const dir = dx < 0 ? 1 : -1
    const target = adjacentVista(dir)
    if (!target) { showSwipeHint(null); return }
    showSwipeHint({ scope: 'vista', dir, ready: Math.abs(dx) >= 80, label: target.titolo || 'Senza titolo' })
  }
  const onEditorTouchEnd = (e) => {
    const s = editSwipe.current; editSwipe.current = null
    showSwipeHint(null)
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) < 80 || Math.abs(dy) > 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    openAdjacentVista(dx < 0 ? 1 : -1)   // swipe verso sinistra = vista successiva
  }

  const visteConFasi = withLocalPins(withLocalStages(viste))
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
          <button className="iconbtn" title={vistaStack.length ? 'Torna alla vista precedente' : 'Chiudi'} onClick={closeVista}>←</button>
          <div className="brand editor-brand"><span>{visioni.find(v => v.id === vistaAperta.visione_id)?.titolo}</span></div>
          <EditorVistaSearch viste={viste} visioni={visioni} current={vistaAperta} onOpen={pushVista} />
          <button className="iconbtn" title="Guida" onClick={() => setGuide('editor')}>?</button>
          <button className="iconbtn" title="Focus" onClick={() => setFocusMode(f => !f)}>{focusMode ? '🔅' : '🎯'}</button>
        </div>
        <div className="content" onTouchStart={onEditorTouchStart} onTouchMove={onEditorTouchMove} onTouchEnd={onEditorTouchEnd}>
          <Editor key={vistaAperta.id} vista={vistaAperta} onChange={saveVista} onWikilink={openByName} focusMode={focusMode} allViste={viste} onSetStage={setStage} onClose={closeVista} jumpTo={jumpText} />
        </div>
        <SwipeHint hint={swipeHint} />
        {prompt && <NamePrompt data={prompt} onClose={() => setPrompt(null)} />}
        {guide && <GuideModal section={guide} onClose={() => setGuide(null)} />}
      </div>
    )
  }

  // ---------- Vista principale a schede ----------
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><BrandLogo /><span>Arbora Notes</span></div>
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

      <div className="content" ref={contentRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div key={tab} className={'tab-pane ' + (tabDir < 0 ? 'from-left' : tabDir > 0 ? 'from-right' : '')}>
          {tab === 'pipe' && (
            <Pipeline visioni={visioni} viste={visteConFasi}
              query={pipeQuery} onQueryChange={setPipeQuery}
              onOpen={openFromList} onPreview={setPreview}
              onAddVisione={addVisione} onAddVista={(visioneId) => addVista({ visioneId })}
              onRenameVisione={renameVisione} onRecolorVisione={recolorVisione}
              onDeleteVista={deleteVista} onDeleteVisione={deleteVisione}
              onReorderVisioni={reorderVisioni} onMoveVistaToVisione={moveVistaToVisione}
              onTogglePin={(v) => setPinned(v.id, !v.pinned)} />
          )}
          {tab === 'tree' && (
            (visioni.length || viste.length)
              ? <Tree viste={visteConFasi} visioni={visioni} onOpen={openFromList}
                  onAddChild={(parent) => addVista({ parent })}
                  onAddToVisione={(visioneId) => addVista({ visioneId })}
                  onReparent={reparent} onMoveToVisione={moveVistaToVisione} onQuickSave={saveVista}
                  onDeleteVista={deleteVista} />
              : <Empty msg="Crea una visione in Pipe per vedere l'albero." />
          )}
          {tab === 'links' && (
            (viste.length)
              ? <Links viste={visteConFasi} visioni={visioni} onOpen={openFromList} />
              : <Empty msg="Crea qualche vista e collegale con ((Nome vista)) per vedere la mappa." />
          )}
          {tab === 'progress' && (
            <Progress viste={visteConFasi} onOpen={openFromList} onSetStage={setStage} />
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

      <SwipeHint hint={swipeHint} />

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
              {(preview.blocchi || []).map((b, bi) => (
                <div key={b.id} className="preview-line" style={{ marginLeft: (b.indent || 0) * 18 }}>
                  {b.text ? <RenderedBlock text={b.text} blocks={preview.blocchi} index={bi} /> : ''}
                </div>
              ))}
              {!(preview.blocchi || []).length && <div style={{color:'var(--text-dim)'}}>Vista vuota.</div>}
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setPreview(null)}>Chiudi</button>
              <button className="btn" onClick={() => { const p = preview; setPreview(null); openFromList(p) }}>Apri e modifica ✎</button>
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
              <label className="menu-import" title="Seleziona la cartella 'Takeout/Keep' scaricata da Google Takeout">
                📥 Importa da Google Keep {busy==='keep' ? '…' : ''}
                <input type="file" accept="application/json" multiple webkitdirectory="" directory="" style={{display:'none'}}
                  onChange={e => { const files = Array.from(e.target.files); e.target.value = ''; doImportKeep(files) }} />
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

// Barra di ricerca nell'header dell'editor: salta rapidamente a un'altra vista.
// Priorità ai match nel titolo, poi nel contenuto. Enter apre il primo risultato.
function EditorVistaSearch({ viste, visioni, current, onOpen }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef(null)
  const visName = (id) => visioni.find(v => v.id === id)?.titolo || ''
  const s = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!s) return []
    const scored = []
    for (const v of viste) {
      if (v.is_template) continue
      const title = (v.titolo || '').toLowerCase()
      let sc = 0
      if (title.includes(s)) sc = 2
      else if ((v.blocchi || []).some(b => (b.text || '').toLowerCase().includes(s))) sc = 1
      if (sc) scored.push({ v, sc, same: v.visione_id === current?.visione_id })
    }
    scored.sort((a, b) => b.sc - a.sc || (b.same ? 1 : 0) - (a.same ? 1 : 0) || (a.v.titolo || '').localeCompare(b.v.titolo || ''))
    return scored.slice(0, 8)
  }, [s, viste, current])

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [])
  useEffect(() => { setHi(0) }, [s])

  // passa il termine cercato solo per i match nel testo (sc===1): la vista aperta scrolla alla riga trovata
  const pick = (v, sc) => { if (!v) return; onOpen(v, sc === 1 ? s : null); setQ(''); setOpen(false) }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setHi(h => Math.min(results.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setHi(h => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') {
      // apre SEMPRE e solo la vista evidenziata (mai crearne una nuova)
      e.preventDefault(); e.stopPropagation()
      const target = results[hi] || results[0]
      if (target) pick(target.v, target.sc)   // results contiene {v, sc, same}: passa la vista, non il wrapper
    }
    else if (e.key === 'Escape') { e.stopPropagation(); setQ(''); setOpen(false); e.currentTarget.blur() }
  }

  return (
    <div className="editor-nav" ref={boxRef} data-noswipe="">
      <span className="editor-nav-ico">🔍</span>
      <input className="editor-nav-input" value={q} placeholder="Vai a una vista…"
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onKeyDown={onKey} />
      {q && <button className="editor-nav-clear" title="Pulisci" onClick={() => { setQ(''); setOpen(false) }}>✕</button>}
      {open && s && (
        <div className="editor-nav-menu">
          {results.length === 0 && <div className="editor-nav-empty">Nessuna vista trovata.</div>}
          {results.map((r, i) => (
            <button key={r.v.id} className={'editor-nav-item' + (i === hi ? ' hi' : '')}
              onMouseEnter={() => setHi(i)} onClick={() => pick(r.v, r.sc)}>
              <span className="editor-nav-title">{r.v.titolo || 'Senza titolo'}</span>
              <span className="editor-nav-vis">{visName(r.v.visione_id)}{r.sc === 1 ? ' · nel testo' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Indicatore che appare durante lo swipe orizzontale: mostra dove si sta per andare
// (sezione o vista adiacente) e si "accende" quando lo spostamento è sufficiente a cambiare.
function SwipeHint({ hint }) {
  if (!hint) return null
  const right = hint.dir > 0
  return (
    <div className={'swipe-hint ' + (right ? 'right' : 'left') + (hint.ready ? ' ready' : '')}>
      <span className="swipe-hint-arrow">{right ? '›' : '‹'}</span>
      <span className="swipe-hint-body">
        <span className="swipe-hint-kind">{hint.scope === 'vista' ? 'Vista' : 'Sezione'}</span>
        <span className="swipe-hint-label">{hint.label}</span>
      </span>
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

// Logo Arbora inline: albero con nodi a cerchio, usa le variabili CSS del tema.
function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--panel-2)" stroke="var(--border)" strokeWidth="6" />
      {/* connettori a gomito */}
      <g fill="none" stroke="var(--green-bright)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d="M150 182 V236 Q150 248 162 248 H244" />
        <path d="M150 182 V346 Q150 358 162 358 H244" />
        <path d="M296 248 V300 Q296 312 308 312 H360" />
      </g>
      {/* nodi = cerchi */}
      <circle cx="150" cy="182" r="40" fill="var(--green)" stroke="var(--green-bright)" strokeWidth="5" />
      <circle cx="150" cy="182" r="15" fill="var(--text)" />
      <circle cx="270" cy="248" r="30" fill="var(--panel)" stroke="var(--green-bright)" strokeWidth="5" />
      <circle cx="270" cy="248" r="10" fill="var(--green-bright)" />
      <circle cx="386" cy="312" r="26" fill="var(--panel)" stroke="var(--green-bright)" strokeWidth="5" />
      <circle cx="386" cy="312" r="9" fill="var(--accent)" />
      <circle cx="270" cy="358" r="30" fill="var(--panel)" stroke="var(--green-bright)" strokeWidth="5" />
      <circle cx="270" cy="358" r="10" fill="var(--green-bright)" />
    </svg>
  )
}

