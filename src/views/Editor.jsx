import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { RenderedBlock } from '../lib/markdown.jsx'
import { logChars } from '../lib/activity.js'
import { cacheVistaLocal } from '../lib/localcache.js'
import { STAGES, stageOf } from '../lib/stages.js'
import { store } from '../lib/store.js'
import { prepareImage } from '../lib/images.js'

const uid = () => 'b-' + Math.random().toString(36).slice(2, 9)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MAX_INDENT = 6
const INDENT_PX = 22     // larghezza di ogni guida di rientro (= un livello)
const INDENT_STEP = 26   // px di trascinamento orizzontale per cambiare livello
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

// Clipboard delle SEZIONI a livello di modulo: sopravvive al cambio vista,
// così puoi tagliare/copiare una sezione da una vista e incollarla in un'altra.
let SECTION_CLIP = []   // [{ text, indent }] con indent normalizzato (il più basso = 0)

// Racchiude la prima occorrenza "libera" di `name` (non già dentro (( )) o [[ ]]) in un collegamento.
function linkifyName(text, name) {
  const re = new RegExp('(?<![\\(\\[])\\b' + escapeRe(name) + '\\b(?![\\)\\]])', 'i')
  return text.replace(re, (match) => '((' + match + '))')
}

const DAY_MS = 24 * 60 * 60 * 1000
// Info scadenza di una riga: classe di colore + etichetta countdown, dai giorni di distanza.
// `due` è una stringa 'YYYY-MM-DD'. Confronto per giorni di calendario (mezzanotte).
function dueInfo(due) {
  if (!due) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(due + 'T00:00:00'); if (isNaN(d.getTime())) return null
  const days = Math.round((d.getTime() - today.getTime()) / DAY_MS)
  if (days < 0)  return { cls: 'due-over',  days, label: days === -1 ? 'scaduta ieri' : `scaduta ${-days} g fa` }
  if (days === 0) return { cls: 'due-today', days, label: 'scade oggi' }
  if (days === 1) return { cls: 'due-soon',  days, label: 'scade domani' }
  if (days <= 3)  return { cls: 'due-soon',  days, label: `tra ${days} g` }
  if (days <= 7)  return { cls: 'due-week',  days, label: `tra ${days} g` }
  return { cls: 'due-later', days, label: `tra ${days} g` }
}

const totalChars = (blocks) => (blocks || []).reduce((n, b) => n + (b.text?.length || 0), 0)
const purgeTrash = (t) => (t || []).filter(x => x && x.deletedAt && Date.now() - x.deletedAt < SEVEN_DAYS)
const relTime = (ts) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'ora'
  if (s < 3600) return Math.floor(s / 60) + ' min fa'
  if (s < 86400) return Math.floor(s / 3600) + ' h fa'
  return Math.floor(s / 86400) + ' g fa'
}
const shortText = (t) => (t || '').replace(/[#*`>]/g, '').trim().slice(0, 44) || 'riga'

// Divide un testo multilinea in righe con livello di rientro dedotto dagli spazi/tab iniziali
// (2 spazi = 1 livello, oppure 1 tab = 1 livello). `base` è il rientro di partenza.
function parseIndented(text, base = 0) {
  return (text || '').replace(/\r/g, '').split('\n').map(line => {
    const ws = (line.match(/^[\t ]*/) || [''])[0]
    const tabs = (ws.match(/\t/g) || []).length
    const spaces = ws.replace(/\t/g, '').length
    const lvl = tabs + Math.floor(spaces / 2)
    return { text: line.slice(ws.length), indent: Math.max(0, Math.min(MAX_INDENT, base + lvl)) }
  })
}

// Editor della singola VISTA: blocchi markdown, drag&drop (riordino + nidificazione),
// click=modifica · doppio click=copia · icona cestino=elimina (con recupero 7 giorni),
// selezione multipla + copia/taglia/incolla di sezioni intere, undo/redo.
export default function Editor({ vista, onChange, onWikilink, focusMode, allViste = [], onSetStage, onClose }) {
  const [stagePick, setStagePick] = useState(false)
  const [blocks, setBlocks] = useState(vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }])
  const [title, setTitle] = useState(vista.titolo || '')
  const [trash, setTrash] = useState(purgeTrash(vista.cestino))
  const [editing, setEditing] = useState(null)     // id del blocco in edit
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [ghost, setGhost] = useState(null)         // { x, y, text } fantasma che segue il cursore
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [showTrash, setShowTrash] = useState(false)
  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved | local
  const [clipCount, setClipCount] = useState(SECTION_CLIP.length)
  const [search, setSearch] = useState('')             // ricerca fra le righe DENTRO questa vista
  const [duePick, setDuePick] = useState(null)         // id della riga di cui si sta impostando la scadenza
  const [bulkDue, setBulkDue] = useState(false)        // popup scadenza per le righe selezionate (Ctrl+D in selezione)
  const [lightbox, setLightbox] = useState(null)       // { blockId, i } immagine aperta a schermo intero
  const [imgBusy, setImgBusy] = useState(false)        // caricamento immagine in corso
  const [, setTick] = useState(0)                      // ri-valuta le scadenze nel tempo (senza interazione)
  const searchRef = useRef(null)                       // input ricerca vista (per la digitazione libera)
  const imgInputRef = useRef(null)                     // input file nascosto per allegare immagini
  const imgTargetId = useRef(null)                     // riga a cui allegare l'immagine scelta
  const undoStack = useRef([])
  const redoStack = useRef([])
  const saveTimer = useRef(null)
  const lastEdit = useRef(null)          // ultimo blocco editato: i tasti toolbar agiscono su questo
  const dragStartX = useRef(0)
  const clickTimer = useRef(null)        // discrimina click (modifica) da doppio-click (copia)
  const prevChars = useRef(totalChars(vista.blocchi))
  const pending = useRef(null)           // { blocks, title, trash } da salvare al volo se si esce
  const rootRef = useRef(null)           // contenitore della vista: riceve il focus all'apertura

  useEffect(() => { if (editing) lastEdit.current = editing }, [editing])

  // aggiorna periodicamente i colori/etichette delle scadenze (una volta al minuto)
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t) }, [])

  // imposta o rimuove la scadenza di una riga ('' = rimuovi)
  const setDue = (id, due) => {
    const next = blocks.map(b => b.id === id ? { ...b, due: due || undefined } : b)
    commit(next)
  }
  // imposta la stessa scadenza su tutte le righe selezionate ('' = rimuovi)
  const setDueMany = (due) => {
    if (!selected.size) return
    const next = blocks.map(b => selected.has(b.id) ? { ...b, due: due || undefined } : b)
    commit(next)
  }

  // Fallback per Safari e browser che non generano l'evento "paste" senza
  // un'interazione precedente: porta il focus sul contenitore appena si apre
  // la vista, così Ctrl+V funziona subito anche senza aver cliccato altrove.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [vista.id])

  // re-sync se cambia la vista aperta (+ pulizia cestino oltre 7 giorni)
  useEffect(() => {
    const b = vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }]
    const cleanTrash = purgeTrash(vista.cestino)
    setBlocks(b)
    setTitle(vista.titolo || '')
    setTrash(cleanTrash)
    setEditing(null); setSelectMode(false); setSelected(new Set()); setShowTrash(false); setSearch('')
    prevChars.current = totalChars(vista.blocchi)
    undoStack.current = []; redoStack.current = []
    if ((vista.cestino || []).length !== cleanTrash.length) {
      onChange({ ...vista, blocchi: b, titolo: vista.titolo || '', cestino: cleanTrash })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.id])

  // salvataggio debounced (+ log caratteri scritti). Include sempre titolo e cestino correnti.
  const persist = (nextBlocks, nextTitle = title, nextTrash = trash) => {
    // SICUREZZA ANTI-PERDITA: scrivi SUBITO e in modo SINCRONO su localStorage, a ogni battuta.
    cacheVistaLocal(vista.id, { titolo: nextTitle, blocchi: nextBlocks, cestino: nextTrash })
    setSaveState('saving')
    pending.current = { blocks: nextBlocks, title: nextTitle, trash: nextTrash }
    const now = totalChars(nextBlocks)
    logChars(now - prevChars.current)
    prevChars.current = now
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      pending.current = null
      const r = await onChange({ ...vista, blocchi: nextBlocks, titolo: nextTitle, cestino: nextTrash })
      setSaveState(r === 'local' ? 'local' : 'saved')
    }, 400)
  }

  // Il conteggio caratteri normale si basa sul delta di lunghezza totale del documento
  // (persist -> logChars). Con un incolla che SOSTITUISCE testo esistente il delta netto
  // può essere quasi nullo o negativo anche se hai incollato molto testo: va registrato
  // esplicitamente qui, e il "prevChars" va avanzato per non farlo poi ricontare due volte.
  const logPasteChars = (len) => {
    if (!(len > 0)) return
    logChars(len)
    prevChars.current += len
  }

  const flush = useCallback(() => {
    if (!pending.current) return
    clearTimeout(saveTimer.current)
    const { blocks: b, title: t, trash: tr } = pending.current
    pending.current = null
    cacheVistaLocal(vista.id, { titolo: t, blocchi: b, cestino: tr })
    onChange({ ...vista, blocchi: b, titolo: t, cestino: tr })
  }, [vista, onChange])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])

  // fantasma di trascinamento che segue il cursore durante il drag HTML5
  useEffect(() => {
    if (!dragId) return
    const onOver = (e) => { if (e.clientX || e.clientY) setGhost(g => g ? { ...g, x: e.clientX, y: e.clientY } : g) }
    document.addEventListener('dragover', onOver)
    return () => document.removeEventListener('dragover', onOver)
  }, [dragId])

  const pushUndo = (snapshot) => {
    undoStack.current.push(JSON.stringify(snapshot))
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
  }

  const commit = (next, { undo = true } = {}) => {
    if (undo) pushUndo(blocks)
    setBlocks(next)
    persist(next, title, trash)
  }

  const undo = () => {
    if (!undoStack.current.length) return
    redoStack.current.push(JSON.stringify(blocks))
    const prev = JSON.parse(undoStack.current.pop())
    setBlocks(prev); persist(prev, title, trash)
  }
  const redo = () => {
    if (!redoStack.current.length) return
    undoStack.current.push(JSON.stringify(blocks))
    const next = JSON.parse(redoStack.current.pop())
    setBlocks(next); persist(next, title, trash)
  }

  // keyboard shortcuts undo/redo + copia righe selezionate
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      // Ctrl+S = entra/esci dalla modalità selezione (blocca il "salva pagina" del browser)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        if (selectMode) exitSelect()
        else { setSelectMode(true); setEditing(null) }
      }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && selectMode && selected.size) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return   // lascia fare la copia nativa dentro un campo
        e.preventDefault()
        copySection()
      }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X') && selectMode && selected.size) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return   // lascia fare il taglio nativo dentro un campo
        e.preventDefault()
        cutSection()
      }
      // Ctrl+M = MAIUSCOLO (righe selezionate oppure la riga in modifica)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        upperShortcut()
      }
      // Ctrl+D = imposta la scadenza (riga in modifica → il suo popup; selezione → popup multiplo)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (editing) { e.preventDefault(); setDuePick(editing) }
        else if (selectMode && selected.size) { e.preventDefault(); setBulkDue(true) }
      }
      // ---- scorciatoie in MODALITÀ SELEZIONE (solo fuori dai campi di testo) ----
      else if (selectMode && selected.size && e.key === 'Delete') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        deleteSelected()   // Canc = elimina le righe selezionate (nel cestino)
      }
      else if (selectMode && selected.size && e.key === 'Backspace') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        clearSelected()    // Backspace = svuota solo il contenuto delle righe selezionate
      }
      else if (selectMode && e.key === 'Escape') {
        e.preventDefault()
        exitSelect()   // Esc = esci dalla selezione
      }
      else if (selectMode && (e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        selectAll()    // Ctrl+A = seleziona tutte le righe
      }
      else if (selectMode && selected.size && e.key === 'Tab') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        indentSelected(e.shiftKey ? -1 : 1)   // Tab = indenta · Shift+Tab = de-indenta
      }
      // Invio senza nulla in modifica/selezione → aggiungi una riga in fondo alla vista
      else if (e.key === 'Enter' && !e.shiftKey && !selectMode && !editing) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        addBlock(null)
      }
      // Esc senza nulla aperto → chiudi la vista (torna all'elenco). L'editing di riga
      // e la ricerca gestiscono Esc per conto loro e fermano la propagazione.
      else if (e.key === 'Escape' && !selectMode && !editing) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        onClose?.()
      }
      // Digitando una lettera (fuori da campi, non in editing/selezione) il testo va
      // automaticamente nella barra di ricerca della vista.
      else if (!selectMode && !editing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        setSearch(s => s + e.key)
        requestAnimationFrame(() => searchRef.current?.focus())
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const setText = (id, text) => {
    const next = blocks.map(b => b.id === id ? { ...b, text } : b)
    setBlocks(next); persist(next, title, trash)
  }

  const setIndent = (id, indent) => {
    const next = blocks.map(b => b.id === id ? { ...b, indent } : b)
    commit(next)
  }

  const addBlock = (afterId = null, text = '') => {
    const src = afterId != null ? blocks.find(b => b.id === afterId) : blocks[blocks.length - 1]
    const nb = { id: uid(), text, indent: src?.indent || 0 }
    let next
    if (afterId == null) next = [...blocks, nb]
    else {
      const idx = blocks.findIndex(b => b.id === afterId)
      next = [...blocks.slice(0, idx + 1), nb, ...blocks.slice(idx + 1)]
    }
    commit(next)
    setEditing(nb.id)
  }

  // Incolla multilinea: divide in più righe con i livelli dedotti dall'indentazione.
  const pasteMultiline = (b, text) => {
    let parts = parseIndented(text, b.indent || 0)
    while (parts.length && parts[parts.length - 1].text.trim() === '') parts.pop()
    if (!parts.length) return
    const made = parts.map(p => ({ id: uid(), text: p.text, indent: p.indent }))
    const idx = blocks.findIndex(x => x.id === b.id)
    const empty = (blocks[idx]?.text || '').trim() === ''
    const next = empty
      ? [...blocks.slice(0, idx), ...made, ...blocks.slice(idx + 1)]      // rimpiazza il blocco vuoto
      : [...blocks.slice(0, idx + 1), ...made, ...blocks.slice(idx + 1)]  // inserisci dopo
    logPasteChars(made.reduce((s, p) => s + p.text.length, 0))
    pushUndo(blocks)
    setBlocks(next); persist(next, title, trash)
    setEditing(null)
    setToast(`Incollate ${made.length} righe`); setTimeout(() => setToast(''), 1300)
  }

  // Incolla "libero": quando NON si sta modificando una riga specifica (nessun blocco in edit),
  // Ctrl+V in qualunque punto della vista crea comunque nuove righe, in fondo alla vista.
  const pasteAtEnd = (text) => {
    let parts = parseIndented(text, 0)
    while (parts.length && parts[parts.length - 1].text.trim() === '') parts.pop()
    if (!parts.length) return
    const made = parts.map(p => ({ id: uid(), text: p.text, indent: p.indent }))
    const last = blocks[blocks.length - 1]
    const emptyLast = last && (last.text || '').trim() === ''
    const next = emptyLast ? [...blocks.slice(0, -1), ...made] : [...blocks, ...made]
    logPasteChars(made.reduce((s, p) => s + p.text.length, 0))
    pushUndo(blocks)
    setBlocks(next); persist(next, title, trash)
    setToast(`Incollate ${made.length} riga${made.length > 1 ? 'e' : ''}`); setTimeout(() => setToast(''), 1300)
  }

  // ascolta il paste di sistema quando non si sta scrivendo in un campo specifico
  // (titolo, ricerca o riga in modifica hanno già il loro onPaste dedicato)
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const text = e.clipboardData?.getData('text') || ''
      if (!text.trim()) return
      e.preventDefault()
      pasteAtEnd(text)
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, title, trash])

  // ---- svuota il contenuto di una riga, mantenendo la riga (niente cestino) ----
  const clearBlock = (id) => {
    const next = blocks.map(b => b.id === id ? { ...b, text: '' } : b)
    commit(next)
  }

  // ---- selezione: svuota il contenuto (Backspace) o elimina le righe (Canc) ----
  const clearSelected = () => {
    if (!selected.size) return
    const next = blocks.map(b => selected.has(b.id) ? { ...b, text: '' } : b)
    commit(next)
  }
  const deleteSelected = () => {
    if (!selected.size) return
    const removed = blocks.filter(b => selected.has(b.id))
    let nextBlocks = blocks.filter(b => !selected.has(b.id))
    if (!nextBlocks.length) nextBlocks = [{ id: uid(), text: '', indent: 0 }]
    const nextTrash = [...removed.map(b => ({ ...b, deletedAt: Date.now() })), ...trash].slice(0, 200)
    pushUndo(blocks)
    setBlocks(nextBlocks); setTrash(nextTrash); setSelected(new Set())
    persist(nextBlocks, title, nextTrash)
    setToast(`Eliminate ${removed.length} riga${removed.length > 1 ? 'e' : ''}`); setTimeout(() => setToast(''), 1300)
  }

  // ---- MAIUSCOLO via scorciatoia (Ctrl+M): righe selezionate, oppure la riga in modifica ----
  const upperShortcut = () => {
    if (selectMode && selected.size) {
      const next = blocks.map(b => selected.has(b.id) ? { ...b, text: (b.text || '').toUpperCase() } : b)
      commit(next)
      return
    }
    upperActive()
  }

  // ---- immagini allegate alle righe: upload su Supabase Storage (o base64 in demo) ----
  const openImagePicker = (id) => { imgTargetId.current = id; imgInputRef.current?.click() }
  const onImageChosen = async (file) => {
    const id = imgTargetId.current
    if (!file || !id || !file.type?.startsWith('image/')) return
    setImgBusy(true)
    setToast('Carico immagine…')
    try {
      const { blob, base64 } = await prepareImage(file)
      let entry
      if (store.isCloud) { const r = await store.uploadImage(blob, vista.id); entry = { url: r.url, path: r.path } }
      else entry = { url: base64, path: null }
      const next = blocks.map(b => b.id === id ? { ...b, imgs: [...(b.imgs || []), entry] } : b)
      commit(next)
      setToast('Immagine allegata')
    } catch (e) {
      setToast('Errore immagine: ' + (e?.message || e))
    } finally {
      setImgBusy(false); imgTargetId.current = null
      setTimeout(() => setToast(''), 1500)
    }
  }
  const removeImageAt = (blockId, i) => {
    const b = blocks.find(x => x.id === blockId)
    const img = (b?.imgs || [])[i]
    const next = blocks.map(x => x.id === blockId ? { ...x, imgs: (x.imgs || []).filter((_, j) => j !== i) } : x)
    commit(next)
    if (img?.path && store.isCloud) store.removeImage(img.path).catch(() => {})
    setLightbox(null)
  }

  // sezione (blocco + suo sotto-albero) per la selezione con Shift+click
  const sectionIdsOf = (b) => {
    const i = blocks.findIndex(x => x.id === b.id)
    const ids = new Set([b.id])
    if (i < 0) return ids
    const hl = headingLevel(b.text)
    if (hl > 0) {
      for (let j = i + 1; j < blocks.length; j++) {
        const jl = headingLevel(blocks[j].text)
        if (jl > 0 && jl <= hl) break
        ids.add(blocks[j].id)
      }
    } else {
      const base = b.indent || 0
      for (let j = i + 1; j < blocks.length; j++) {
        if ((blocks[j].indent || 0) > base) ids.add(blocks[j].id); else break
      }
    }
    return ids
  }

  // ---- elimina riga: va nel CESTINO (recuperabile 7 giorni) ----
  const deleteBlock = (id) => {
    const b = blocks.find(x => x.id === id)
    let nextBlocks = blocks.filter(x => x.id !== id)
    if (!nextBlocks.length) nextBlocks = [{ id: uid(), text: '', indent: 0 }]
    const nextTrash = b ? [{ ...b, deletedAt: Date.now() }, ...trash].slice(0, 200) : trash
    pushUndo(blocks)
    setBlocks(nextBlocks); setTrash(nextTrash)
    setEditing(e => e === id ? null : e)
    persist(nextBlocks, title, nextTrash)
  }

  const restoreBlock = (tb) => {
    const { deletedAt, ...clean } = tb
    const nb = { ...clean, id: uid() }
    const nextBlocks = [...blocks, nb]
    const nextTrash = trash.filter(x => x !== tb)
    pushUndo(blocks)
    setBlocks(nextBlocks); setTrash(nextTrash)
    persist(nextBlocks, title, nextTrash)
    setToast('Riga ripristinata'); setTimeout(() => setToast(''), 1200)
  }

  const purgeOne = (tb) => {
    const nextTrash = trash.filter(x => x !== tb)
    setTrash(nextTrash); persist(blocks, title, nextTrash)
  }
  const emptyTrash = () => { setTrash([]); persist(blocks, title, []) }

  // ---- copia (doppio click / doppio tap sul testo) ----
  const copyBlock = (b) => {
    navigator.clipboard?.writeText(b.text).catch(() => {})
    setFlash(b.id)
    setTimeout(() => setFlash(null), 700)
  }

  const copySheet = () => {
    const text = blocks.map(b => '  '.repeat(b.indent || 0) + b.text).join('\n')
    navigator.clipboard?.writeText(text).catch(() => {})
    setToast('Foglio copiato'); setTimeout(() => setToast(''), 1200)
  }

  // ---- click = modifica · doppio click = copia · triplo click/tap = selezione ----
  const tapRef = useRef({ id: null, n: 0, t: null })
  const activateBlock = (b, e) => {
    if (rowJustHandled.current) { rowJustHandled.current = false; return }  // veniamo da un drag/swipe della riga
    // Shift+click in selezione (da PC) = seleziona l'intera sezione (blocco + figli)
    if (selectMode && e?.shiftKey) {
      const sec = sectionIdsOf(b)
      setSelected(s => { const n = new Set(s); sec.forEach(id => n.add(id)); return n })
      return
    }
    if (selectMode) {
      // triplo tocco = esci dalla selezione (comodo su telefono/tablet, dove la barra
      // con la ✕ può essere fuori schermo). I primi due tap si annullano a vicenda.
      const tr = tapRef.current
      if (tr.id !== b.id) { tr.id = b.id; tr.n = 0 }
      tr.n++
      clearTimeout(tr.t)
      if (tr.n >= 3) {
        tr.n = 0; tr.id = null
        exitSelect()
        try { navigator.vibrate?.(12) } catch { /* ignore */ }
        return
      }
      tr.t = setTimeout(() => { tr.id = null; tr.n = 0 }, 480)
      toggleSelect(b.id)
      return
    }
    // conteggio tap ravvicinati sulla stessa riga: 3 = attiva la selezione
    const tr = tapRef.current
    if (tr.id !== b.id) { tr.id = b.id; tr.n = 0 }
    tr.n++
    clearTimeout(tr.t)
    if (tr.n >= 3) {
      tr.n = 0; tr.id = null
      if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
      setEditing(null); setSelectMode(true); setSelected(new Set([b.id]))
      try { navigator.vibrate?.(12) } catch { /* ignore */ }
      return
    }
    tr.t = setTimeout(() => { tr.id = null; tr.n = 0 }, 480)
    if (clickTimer.current) return               // arriverà il doppio click
    clickTimer.current = setTimeout(() => { clickTimer.current = null; setEditing(b.id) }, 230)
  }
  const doubleBlock = (b) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    if (selectMode) return
    copyBlock(b)
  }

  // ---- selezione multipla ----
  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const selectAll = () => setSelected(new Set(blocks.map(b => b.id)))

  // trascina sopra più caselle ☑ per selezionarle/deselezionarle in blocco
  const selDrag = useRef(null)   // { adding: bool, touched: Set }
  const selDragOn = (id) => {
    setSelected(s => {
      const willAdd = !s.has(id)
      selDrag.current = { adding: willAdd, touched: new Set([id]) }
      const n = new Set(s); willAdd ? n.add(id) : n.delete(id); return n
    })
  }
  const selDragEnter = (id) => {
    const d = selDrag.current
    if (!d || d.touched.has(id)) return
    d.touched.add(id)
    setSelected(s => {
      const n = new Set(s); d.adding ? n.add(id) : n.delete(id); return n
    })
  }
  useEffect(() => {
    const end = () => { selDrag.current = null }
    // pointerenter funziona solo col mouse: per il touch (il dito "trascina" mantenendo
    // il pointer capture sul primo elemento) serviamo elementFromPoint sotto il dito.
    const move = (e) => {
      if (!selDrag.current || e.pointerType !== 'touch') return
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.sel-box')
      const id = el?.getAttribute('data-block-id')
      if (id) selDragEnter(id)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointermove', move)
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointermove', move) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const indentSelected = (dir) => {
    if (!selected.size) return
    pushUndo(blocks)
    const next = blocks.map(b => {
      if (!selected.has(b.id)) return b
      const cur = b.indent || 0
      return { ...b, indent: dir > 0 ? Math.min(MAX_INDENT, cur + 1) : Math.max(0, cur - 1) }
    })
    setBlocks(next); persist(next, title, trash)
  }
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()) }

  // ---- Copia / Taglia / Incolla SEZIONI (blocco + suo sotto-albero) ----
  // livello di un titolo markdown: "# "=1, "## "=2, "### "=3; 0 se non è un titolo
  const headingLevel = (t) => { const m = (t || '').match(/^(#{1,6})\s/); return m ? m[1].length : 0 }
  const expandToSection = () => {
    if (!selected.size) return
    const ids = new Set(selected)
    blocks.forEach((b, i) => {
      if (!selected.has(b.id)) return
      const hl = headingLevel(b.text)
      if (hl > 0) {
        // sezione a TITOLI: dal titolo fino al prossimo titolo di pari o maggiore livello
        for (let j = i + 1; j < blocks.length; j++) {
          const jl = headingLevel(blocks[j].text)
          if (jl > 0 && jl <= hl) break
          ids.add(blocks[j].id)
        }
      } else {
        // sezione a RIENTRO: il blocco + il suo sotto-albero (figli più indentati)
        const base = b.indent || 0
        for (let j = i + 1; j < blocks.length; j++) {
          if ((blocks[j].indent || 0) > base) ids.add(blocks[j].id)
          else break
        }
      }
    })
    setSelected(ids)
  }
  const selectedInOrder = () => blocks.filter(b => selected.has(b.id))
  const asText = (arr) => arr.map(b => '  '.repeat(b.indent || 0) + b.text).join('\n')
  const putClip = (arr) => {
    const min = Math.min(...arr.map(b => b.indent || 0))
    SECTION_CLIP = arr.map(b => ({ text: b.text, indent: (b.indent || 0) - min }))
    setClipCount(SECTION_CLIP.length)
    navigator.clipboard?.writeText(asText(arr)).catch(() => {})
  }
  const copySection = () => {
    const sel = selectedInOrder(); if (!sel.length) return
    putClip(sel)
    setToast(`Sezione copiata (${sel.length} righe)`); setTimeout(() => setToast(''), 1300)
  }
  const cutSection = () => {
    const sel = selectedInOrder(); if (!sel.length) return
    putClip(sel)
    const nextTrash = [...sel.map(b => ({ ...b, deletedAt: Date.now() })), ...trash].slice(0, 200)
    let nextBlocks = blocks.filter(b => !selected.has(b.id))
    if (!nextBlocks.length) nextBlocks = [{ id: uid(), text: '', indent: 0 }]
    pushUndo(blocks)
    setBlocks(nextBlocks); setTrash(nextTrash); setSelected(new Set())
    persist(nextBlocks, title, nextTrash)
    setToast(`Sezione tagliata (${sel.length} righe)`); setTimeout(() => setToast(''), 1300)
  }
  // incolla dopo l'ultima riga selezionata (o in fondo se non c'è selezione)
  const pasteSection = () => {
    if (!SECTION_CLIP.length) return
    const sel = selectedInOrder()
    const anchor = sel.length ? sel[sel.length - 1] : blocks[blocks.length - 1]
    const idx = anchor ? blocks.findIndex(b => b.id === anchor.id) : blocks.length - 1
    const base = sel.length && anchor ? (anchor.indent || 0) : 0
    const inserted = SECTION_CLIP.map(c => ({ id: uid(), text: c.text, indent: Math.min(MAX_INDENT, base + c.indent) }))
    const next = [...blocks.slice(0, idx + 1), ...inserted, ...blocks.slice(idx + 1)]
    logPasteChars(inserted.reduce((s, c) => s + c.text.length, 0))
    pushUndo(blocks)
    setBlocks(next); persist(next, title, trash)
    setToast(`Incollate ${inserted.length} righe`); setTimeout(() => setToast(''), 1300)
  }

  // rientro massimo consentito per un blocco: al più (rientro del precedente + 1)
  const maxIndentFor = (arr, index) => {
    if (index <= 0) return 0
    return Math.min(MAX_INDENT, (arr[index - 1].indent || 0) + 1)
  }

  // ---- drag & drop: riordino (verticale) + nidificazione (orizzontale) ----
  const onDragStart = (e, id) => {
    setDragId(id)
    dragStartX.current = e.clientX
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', blocks.find(b => b.id === id)?.text || '')
    // nasconde il fantasma nativo: usiamo il nostro (.drag-ghost) che segue il cursore
    try {
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(img, 0, 0)
    } catch { /* ignore */ }
    setGhost({ x: e.clientX, y: e.clientY, text: blocks.find(b => b.id === id)?.text || '' })
  }
  const onDragOver = (e, id) => { e.preventDefault(); if (id !== dropId) setDropId(id) }

  const applyDrag = (targetId, clientX) => {
    const stepDelta = Math.round((clientX - dragStartX.current) / INDENT_STEP)
    let next = [...blocks]
    if (dragId !== targetId) {
      const from = next.findIndex(b => b.id === dragId)
      const to = next.findIndex(b => b.id === targetId)
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
    }
    if (stepDelta !== 0) {
      const idx = next.findIndex(b => b.id === dragId)
      const cur = next[idx]?.indent || 0
      const want = Math.max(0, cur + stepDelta)
      const capped = Math.min(want, maxIndentFor(next, idx))
      next = next.map(b => b.id === dragId ? { ...b, indent: capped } : b)
    }
    commit(next)
  }

  const onDrop = (e, id) => {
    e.preventDefault()
    if (!dragId) { setDragId(null); setDropId(null); setGhost(null); return }
    applyDrag(id, e.clientX)
    setDragId(null); setDropId(null); setGhost(null)
  }
  const endDrag = () => { setDragId(null); setDropId(null); setGhost(null) }

  // ---- TOUCH: trascina la riga premendo in mezzo ----
  // Tocco+attesa (long-press) al centro della riga → modalità trascinamento:
  //   • muovi in verticale = riordina · muovi in orizzontale = cambia livello di nidificazione.
  // Swipe orizzontale rapido (senza attesa) al centro della riga → ±1 livello.
  // (Su desktop resta il drag HTML5 con la maniglia ⠿.)
  const rowDrag = useRef(null)
  const rowJustHandled = useRef(false)   // evita che il click apra la modifica dopo drag/swipe
  const LONGPRESS_MS = 260
  const SWIPE_MIN = 42

  const onRowDown = (e, b) => {
    rowJustHandled.current = false
    if (selectMode || editing === b.id || e.pointerType === 'mouse') return
    const el = e.currentTarget
    const d = {
      id: b.id, el, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
      lastX: e.clientX, lastY: e.clientY, startIndent: b.indent || 0, text: b.text,
      active: false, over: null,
    }
    d.timer = setTimeout(() => {
      d.active = true
      try { el.setPointerCapture?.(d.pointerId) } catch { /* ignore */ }
      setDragId(b.id)
      setGhost({ x: d.lastX, y: d.lastY, text: d.text })
      try { navigator.vibrate?.(12) } catch { /* ignore */ }
    }, LONGPRESS_MS)
    rowDrag.current = d
  }
  const onRowMove = (e) => {
    const d = rowDrag.current
    if (!d) return
    d.lastX = e.clientX; d.lastY = e.clientY
    if (!d.active) {
      // prima del long-press: se il dito si muove troppo è uno scroll/swipe → annulla il timer
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 12) { clearTimeout(d.timer); d.timedOut = true }
      return
    }
    e.preventDefault()
    setGhost(g => (g ? { ...g, x: e.clientX, y: e.clientY } : g))
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.block')
    const overId = el?.getAttribute('data-block-id')
    if (overId && overId !== d.id) { d.over = overId; setDropId(overId) }
    else if (!overId) setDropId(null)
  }
  const onRowUp = (e) => {
    const d = rowDrag.current
    if (!d) return
    clearTimeout(d.timer); rowDrag.current = null
    const dx = (e.clientX ?? d.lastX) - d.sx
    const dy = (e.clientY ?? d.lastY) - d.sy
    if (!d.active) {
      // niente long-press: swipe orizzontale rapido = ±1 livello di nidificazione
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.6) {
        rowJustHandled.current = true
        const i = blocks.findIndex(x => x.id === d.id)
        if (dx > 0) setIndent(d.id, Math.min(maxIndentFor(blocks, i), (blocks[i]?.indent || 0) + 1))
        else setIndent(d.id, Math.max(0, (blocks[i]?.indent || 0) - 1))
      }
      return   // altrimenti è un tap: lascia gestire la modifica a onClick
    }
    // era un drag: riordino (verticale) + eventuale cambio livello (delta orizzontale)
    rowJustHandled.current = true
    const stepDelta = Math.round(dx / INDENT_STEP)
    let next = [...blocks]
    if (d.over && d.over !== d.id) {
      const from = next.findIndex(x => x.id === d.id)
      const to = next.findIndex(x => x.id === d.over)
      if (from !== -1 && to !== -1) { const [m] = next.splice(from, 1); next.splice(to, 0, m) }
    }
    if (stepDelta !== 0) {
      const idx = next.findIndex(x => x.id === d.id)
      const want = Math.max(0, d.startIndent + stepDelta)
      const capped = Math.min(want, maxIndentFor(next, idx))
      next = next.map(x => x.id === d.id ? { ...x, indent: capped } : x)
    }
    setDragId(null); setDropId(null); setGhost(null)
    commit(next)
  }
  const onRowCancel = () => {
    const d = rowDrag.current
    if (!d) return
    clearTimeout(d.timer); rowDrag.current = null
    if (d.active) { setDragId(null); setDropId(null); setGhost(null) }
  }

  const titleChange = (v) => { setTitle(v); persist(blocks, v, trash) }

  // ---- grassetto / corsivo: avvolge la selezione del textarea (Ctrl+B / Ctrl+I) ----
  const applyWrap = (el, id, mark) => {
    const s = el.selectionStart, e = el.selectionEnd, val = el.value
    const sel = val.slice(s, e) || 'testo'
    const nv = val.slice(0, s) + mark + sel + mark + val.slice(e)
    setText(id, nv)
    const ns = s + mark.length, ne = ns + sel.length
    requestAnimationFrame(() => { try { el.focus(); el.selectionStart = ns; el.selectionEnd = ne } catch {} })
  }

  // ---- MAIUSCOLO: trasforma in maiuscolo il testo selezionato nella riga in modifica;
  //      se non c'è selezione, mette in maiuscolo l'intera riga attiva. ----
  const upperActive = () => {
    const el = document.activeElement
    if (editing && el && el.tagName === 'TEXTAREA') {
      const s = el.selectionStart, e = el.selectionEnd, val = el.value
      if (s !== e) {
        const nv = val.slice(0, s) + val.slice(s, e).toUpperCase() + val.slice(e)
        setText(editing, nv)
        requestAnimationFrame(() => { try { el.focus(); el.selectionStart = s; el.selectionEnd = e } catch {} })
        return
      }
      setText(editing, val.toUpperCase())
      return
    }
    const id = editing || lastEdit.current
    if (!id) return
    const b = blocks.find(x => x.id === id)
    if (b) setText(id, (b.text || '').toUpperCase())
  }

  // ---- suggerimento collegamenti: se scrivi il nome di un'altra vista ----
  const editingText = blocks.find(b => b.id === editing)?.text || ''
  const suggestions = useMemo(() => {
    const t = editingText
    if (!t.trim()) return []
    const seen = new Set()
    const out = []
    for (const v of allViste) {
      if (v.id === vista.id) continue
      const name = (v.titolo || '').trim()
      if (name.length < 2 || seen.has(name.toLowerCase())) continue
      if (t.includes('((' + name + '))') || t.includes('[[' + name + ']]')) continue
      const re = new RegExp('(?<![\\(\\[])\\b' + escapeRe(name) + '\\b(?![\\)\\]])', 'i')
      if (re.test(t)) { seen.add(name.toLowerCase()); out.push(name) }
      if (out.length >= 4) break
    }
    return out
  }, [editingText, allViste, vista.id])

  const applyLink = (name) => {
    if (!editing) return
    const b = blocks.find(x => x.id === editing)
    if (!b) return
    setText(editing, linkifyName(b.text, name))
  }

  const isPlain = (t) => t && !t.startsWith('#') && t.trim() !== '---'

  // ---- ricerca dentro la vista: evidenzia le righe che contengono il testo cercato ----
  const sq = search.trim().toLowerCase()
  const matchSet = useMemo(() => {
    if (!sq) return null
    const s = new Set()
    blocks.forEach(b => { if ((b.text || '').toLowerCase().includes(sq)) s.add(b.id) })
    return s
  }, [sq, blocks])
  const matchCount = matchSet ? matchSet.size : 0

  // auto-altezza della textarea: cresce col contenuto (anche con testo mandato a capo)
  const autosize = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }

  return (
    <div className="editor" ref={rootRef} tabIndex={-1}>
      <div className="editor-sticky">
      <div className="editor-head">
        <input className="editor-title" value={title} placeholder="Titolo della vista…"
          onChange={e => titleChange(e.target.value)} />
        {onSetStage && (
          <div className="stage-pick-wrap">
            <button type="button" className="stage-pill" style={{ '--stage': stageOf(vista).color }}
              title="Fase del progresso" onClick={() => setStagePick(s => !s)}>
              <span className="stage-dot" /> {stageOf(vista).label}
            </button>
            {stagePick && (
              <>
                <div className="stage-pick-scrim" onClick={() => setStagePick(false)} />
                <div className="stage-pick-menu">
                  {STAGES.map(s => (
                    <button key={s.id} type="button"
                      className={'stage-opt' + (stageOf(vista).id === s.id ? ' active' : '')}
                      style={{ '--stage': s.color }}
                      onClick={() => { onSetStage(vista.id, s.id); setStagePick(false) }}>
                      <span className="stage-dot" /> {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <span className={'save-state ' + saveState} title={
          saveState === 'saved' ? 'Salvato nel cloud' :
          saveState === 'local' ? 'Salvato su questo dispositivo (cloud non raggiungibile)' :
          saveState === 'saving' ? 'Salvataggio…' : ''}>
          {saveState === 'saving' && '⏳ Salvataggio…'}
          {saveState === 'saved' && '☁ Salvato nel cloud'}
          {saveState === 'local' && '💾 Solo su questo dispositivo'}
        </span>
      </div>

      {!focusMode && (
        <>
        <div className="toolbar" data-noswipe="" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
          <button className="iconbtn" title="Annulla (Ctrl+Z)" onClick={undo}>↶</button>
          <button className="iconbtn" title="Ripeti (Ctrl+Y)" onClick={redo}>↷</button>
          <button className="iconbtn" title="Titolo" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, '# ' + (blocks.find(b=>b.id===id)?.text||'')) }}>H</button>
          <button className="iconbtn" title="Grassetto (Ctrl+B)" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, (blocks.find(b=>b.id===id)?.text||'') + '**testo**') }}><b>B</b></button>
          <button className="iconbtn" title="Corsivo (Ctrl+I)" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, (blocks.find(b=>b.id===id)?.text||'') + '*testo*') }}><i>c</i></button>
          <button className="iconbtn" title="MAIUSCOLO — trasforma in maiuscolo il testo selezionato (o l'intera riga)" onClick={upperActive}><span style={{fontSize:'12px',fontWeight:800,letterSpacing:'.5px'}}>AA</span></button>
          <button className="iconbtn" title="Rientra (nidifica)" onClick={() => { const id = editing || lastEdit.current; if (!id) return; const i = blocks.findIndex(b=>b.id===id); setIndent(id, Math.min(maxIndentFor(blocks, i), (blocks[i].indent||0)+1)) }}>⇥</button>
          <button className="iconbtn" title="Riduci rientro" onClick={() => { const id = editing || lastEdit.current; if (!id) return; const b = blocks.find(x=>x.id===id); setIndent(id, Math.max(0,(b.indent||0)-1)) }}>⇤</button>
          <button className="iconbtn" title="Sezione / divisore" onClick={() => addBlock(editing || lastEdit.current, '---')}>—</button>
          <button className="iconbtn" title="Inserisci collegamento a un'altra vista" onClick={() => {
            const id = editing || lastEdit.current || (blocks[0] && blocks[0].id)
            if (!id) return
            if (!editing) setEditing(id)
            const t = blocks.find(b=>b.id===id)?.text || ''
            setText(id, t + (t && !t.endsWith(' ') ? ' ' : '') + '((Nome della vista))')
          }}>🔗</button>
        </div>

        {/* Riga azioni: copia foglio · selezione · incolla · cestino */}
        <div className="toolbar toolbar-2" data-noswipe="" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
          {!selectMode ? (
            <>
              <button className="pillbtn" title="Copia tutto il foglio" onClick={copySheet}>⧉ Copia foglio</button>
              <button className="pillbtn" title="Seleziona righe per copiarle/tagliarle/ri-tabularle" onClick={() => { setSelectMode(true); setEditing(null) }}>☑ Seleziona</button>
              {clipCount > 0 && (
                <button className="pillbtn" title="Incolla la sezione copiata in fondo alla vista" onClick={pasteSection}>📌 Incolla ({clipCount})</button>
              )}
              <button className={'pillbtn' + (showTrash ? ' on' : '')} title="Righe eliminate (ultimi 7 giorni)" onClick={() => setShowTrash(s => !s)}>🗑 Cestino{trash.length ? ` (${trash.length})` : ''}</button>
            </>
          ) : (
            <>
              <span className="sel-count">{selected.size} sel.</span>
              <button className="pillbtn" title="Seleziona tutte le righe" onClick={selectAll}>☑ Tutte</button>
              <button className="pillbtn" title="Estendi alla sezione (blocco + figli)" onClick={expandToSection}>⤵ Sezione</button>
              <button className="pillbtn" title="Aumenta rientro" onClick={() => indentSelected(1)}>⇥</button>
              <button className="pillbtn" title="Riduci rientro" onClick={() => indentSelected(-1)}>⇤</button>
              <button className="pillbtn" title="Copia la sezione (mantiene i livelli)" onClick={copySection}>⧉ Copia</button>
              <button className="pillbtn" title="Taglia la sezione (va nel cestino)" onClick={cutSection}>✂ Taglia</button>
              <button className="pillbtn" title="Incolla dopo la riga selezionata" onClick={pasteSection} disabled={!clipCount}>📌 Incolla{clipCount ? ` (${clipCount})` : ''}</button>
              <button className="pillbtn danger" title="Chiudi selezione" onClick={exitSelect}>✕</button>
            </>
          )}
        </div>
        </>
      )}

      {suggestions.length > 0 && (
        <div className="link-suggest">
          <span className="link-suggest-lbl">Collega a:</span>
          {suggestions.map(name => (
            <button key={name} className="link-suggest-chip" onClick={() => applyLink(name)}>🔗 {name}</button>
          ))}
        </div>
      )}
      </div>

      {!focusMode && (
        <div className="link-hint">
          <ul className="hint-list">
            <li><b>Click</b> riga = modifica · <b>doppio</b> = copia · <b>triplo</b> = selezione · <b>rotellina</b> = nuova riga sotto</li>
            <li><b>＋</b> nuova riga · <b>⌫</b> svuota · <b>🗑</b> elimina (7 gg) · <b>🖼</b> allega immagine</li>
            <li><b>Invio</b> nuova riga · <b>Tab</b>/<b>⇧Tab</b> nidifica · trascina ←/→ · <code>Esc</code> chiudi vista</li>
            <li><code>Ctrl+B</code> grassetto · <code>Ctrl+I</code> corsivo · <code>Ctrl+M</code> MAIUSCOLO · <code>Ctrl+D</code> scadenza · <code>Ctrl+Z</code>/<code>Ctrl+Y</code> annulla/ripeti</li>
            <li><b>☑ Seleziona</b> → <code>Ctrl+C</code>/<code>Ctrl+X</code>/<code>Ctrl+A</code> · <code>Tab</code> rientro · <code>Canc</code> elimina · <code>Backspace</code> svuota · <code>Shift+click</code> sezione · <code>Esc</code> esci</li>
            <li><b>📅</b> scadenza riga (sfondo colorato + countdown) · <b>AA</b>/<code>Ctrl+M</code> MAIUSCOLO</li>
            <li><b>🔍</b> cerca (o scrivi per cercare) · <b>🔗</b> collega vista · swipe ←/→ cambia vista</li>
          </ul>
        </div>
      )}

      {/* Pannello CESTINO (nascosto, si apre col pulsante) */}
      {showTrash && !focusMode && (
        <div className="trash-panel">
          <div className="trash-head">
            <b>🗑 Cestino</b> <span className="trash-sub">righe eliminate · conservate 7 giorni</span>
            {trash.length > 0 && <button className="pillbtn danger" onClick={emptyTrash}>Svuota</button>}
          </div>
          {trash.length === 0 ? (
            <div className="trash-empty">Nessuna riga eliminata di recente.</div>
          ) : trash.map((tb, i) => (
            <div key={i} className="trash-row">
              <div className="trash-text">{tb.text ? <RenderedBlock text={tb.text} /> : <span style={{color:'var(--text-dim)'}}>(riga vuota)</span>}</div>
              <span className="trash-when">{relTime(tb.deletedAt)}</span>
              <button className="iconbtn mini" title="Ripristina" onClick={() => restoreBlock(tb)}>↩</button>
              <button className="iconbtn mini danger" title="Elimina definitivamente" onClick={() => purgeOne(tb)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="view-search" data-noswipe="">
        <span className="view-search-ico">🔍</span>
        <input className="view-search-input" ref={searchRef} value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (search) setSearch(''); else e.currentTarget.blur() } }}
          placeholder="Cerca in questa vista…" />
        {sq && <span className="view-search-count">{matchCount} ris.</span>}
        {search && <button className="view-search-clear" title="Pulisci" onClick={() => setSearch('')}>✕</button>}
      </div>

      <div className="blocks-list" data-noswipe="">
      {blocks.map(b => {
        const indent = b.indent || 0
        const isSel = selected.has(b.id)
        const isHit = matchSet ? matchSet.has(b.id) : false
        const di = b.due ? dueInfo(b.due) : null
        return (
        <div key={b.id} data-block-id={b.id} data-noswipe=""
          className={'block' + (dragId === b.id ? ' dragging' : '') + (dropId === b.id ? ' drop-target' : '') + (indent ? ' nested' : '') + (isSel ? ' selected' : '') + (matchSet && !isHit ? ' search-dim' : '') + (isHit ? ' search-hit' : '') + (di ? ' ' + di.cls : '')}
          draggable={editing !== b.id && !selectMode}
          onDragStart={e => onDragStart(e, b.id)}
          onDragOver={e => onDragOver(e, b.id)}
          onDrop={e => onDrop(e, b.id)}
          onDragEnd={endDrag}
        >
          {/* guide di tabulazione: linee verticali sottili per i livelli superiori, una curva "╰─"
              per l'ultimo livello (stile schema ad albero, disegnata coi bordi: niente glifi di
              testo che finivano nascosti dietro la maniglia ⠿) */}
          {Array.from({ length: indent }).map((_, i) => (
            <span key={i} className={'indent-guide' + (i === indent - 1 ? ' indent-elbow' : '')}>
              {i === indent - 1 && <span className="level-num" title={'Livello ' + indent}>{indent}</span>}
            </span>
          ))}
          {selectMode && (
            <span className={'sel-box' + (isSel ? ' on' : '')} data-block-id={b.id}
              onPointerDown={e => { e.preventDefault(); selDragOn(b.id) }}
              onPointerEnter={() => { if (selDrag.current) selDragEnter(b.id) }}>{isSel ? '✓' : ''}</span>
          )}
          <span className="handle" title="Trascina · dx/sx per nidificare">⠿</span>
          {editing === b.id ? (
            <textarea
              className="row-input"
              ref={el => { if (el) { autosize(el); if (document.activeElement !== el) el.focus({ preventScroll: true }) } }}
              value={b.text} rows={1}
              onInput={e => autosize(e.target)}
              onChange={e => setText(b.id, e.target.value)}
              onBlur={() => setEditing(null)}
              onPaste={e => {
                const text = e.clipboardData?.getData('text') || ''
                if (!text) return
                if (text.includes('\n')) { e.preventDefault(); pasteMultiline(b, text) }
                else logPasteChars(text.length)   // incolla su una riga sola: lascia fare il browser, registra solo i caratteri
              }}
              onKeyDown={e => {
                const el = e.target
                if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); applyWrap(el, b.id, '**') }
                else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); applyWrap(el, b.id, '*') }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBlock(b.id) }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null) }
                else if (e.key === 'Backspace' && b.text === '') { e.preventDefault(); deleteBlock(b.id) }
                else if (e.key === 'Tab') { e.preventDefault(); const i = blocks.findIndex(x=>x.id===b.id); if (e.shiftKey) setIndent(b.id, Math.max(0,(b.indent||0)-1)); else setIndent(b.id, Math.min(maxIndentFor(blocks, i),(b.indent||0)+1)) }
              }} />
          ) : (
            <div className="rendered"
              onPointerDown={e => onRowDown(e, b)} onPointerMove={onRowMove}
              onPointerUp={onRowUp} onPointerCancel={onRowCancel}
              onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
              onAuxClick={e => { if (e.button === 1) { e.preventDefault(); addBlock(b.id) } }}
              onClick={e => activateBlock(b, e)} onDoubleClick={() => doubleBlock(b)}
              title="Click: modifica · Doppio click: copia · rotellina: nuova riga sotto · tieni premuto per trascinare · swipe ←/→ per nidificare">
              {b.text ? <RenderedBlock text={b.text} onWikilink={onWikilink} /> : <span style={{color:'var(--text-dim)'}}>Vuoto — clicca per scrivere</span>}
            </div>
          )}
          {b.imgs?.length > 0 && (
            <div className="row-thumbs" data-noswipe="">
              {b.imgs.map((im, i) => (
                <button key={i} className="row-thumb" title="Apri immagine"
                  onClick={() => setLightbox({ blockId: b.id, i })}
                  style={{ backgroundImage: `url("${im.url}")` }} />
              ))}
            </div>
          )}
          {di && (
            <span className={'due-badge ' + di.cls} title={'Scadenza: ' + b.due}
              onClick={() => { if (!selectMode) setDuePick(p => p === b.id ? null : b.id) }}>⏰ {di.label}</span>
          )}
          <span className={'copytap' + (flash === b.id ? ' copied-flash' : '')}>{flash === b.id ? 'copiato!' : ''}</span>
          {!selectMode && (
            <div className="due-wrap" data-noswipe="">
              <button className={'iconbtn row-due' + (b.due ? ' has' : '') + (di ? ' ' + di.cls : '')}
                title={b.due ? 'Scadenza: ' + b.due + ' — clicca per modificare' : 'Imposta una scadenza per questa riga'}
                onClick={() => setDuePick(p => p === b.id ? null : b.id)}>📅</button>
              {duePick === b.id && (
                <>
                  <div className="due-scrim" onClick={() => setDuePick(null)} />
                  <div className="due-pop" onClick={e => e.stopPropagation()}>
                    <label className="due-pop-lbl">Scadenza</label>
                    {/* alla scelta chiudiamo subito il popup: evita il "flicker" dovuto al
                        re-render mentre il selettore nativo è ancora aperto */}
                    <input type="date" className="due-input" value={b.due || ''}
                      onChange={e => { setDue(b.id, e.target.value); setDuePick(null) }} />
                    <div className="due-pop-row">
                      {b.due && <button className="pillbtn danger" onClick={() => { setDue(b.id, ''); setDuePick(null) }}>Rimuovi</button>}
                      <button className="pillbtn" onClick={() => setDuePick(null)}>Fatto</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {!selectMode && (
            <button className="iconbtn row-img" title="Allega un'immagine a questa riga"
              onClick={() => openImagePicker(b.id)} disabled={imgBusy}>🖼</button>
          )}
          {!selectMode && b.text && (
            <button className="iconbtn row-clear" title="Svuota il contenuto della riga"
              onClick={() => clearBlock(b.id)}>⌫</button>
          )}
          {!selectMode && (
            <button className="iconbtn row-del" title="Elimina riga (recuperabile 7 giorni)"
              onClick={() => deleteBlock(b.id)}>🗑</button>
          )}
          {!selectMode && (
            <button className="row-insert" title="Inserisci una riga qui sotto"
              onClick={() => addBlock(b.id)}>＋</button>
          )}
        </div>
        )
      })}
      </div>

      <button className="add-btn" style={{marginTop:12}} onClick={() => addBlock(null)}>＋ Aggiungi blocco in fondo</button>

      {/* input file nascosto per gli allegati immagine */}
      <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onImageChosen(f) }} />

      {/* scadenza per le righe selezionate (Ctrl+D in selezione) */}
      {bulkDue && (
        <div className="due-scrim due-scrim-center" onClick={() => setBulkDue(false)}>
          <div className="due-pop due-pop-center" onClick={e => e.stopPropagation()}>
            <label className="due-pop-lbl">Scadenza · {selected.size} righe</label>
            <input type="date" className="due-input" autoFocus
              onChange={e => { setDueMany(e.target.value); setBulkDue(false) }} />
            <div className="due-pop-row">
              <button className="pillbtn danger" onClick={() => { setDueMany(''); setBulkDue(false) }}>Rimuovi</button>
              <button className="pillbtn" onClick={() => setBulkDue(false)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* immagine a schermo intero (lightbox) */}
      {lightbox && (() => {
        const lb = blocks.find(b => b.id === lightbox.blockId)
        const im = lb?.imgs?.[lightbox.i]
        if (!im) return null
        return (
          <div className="img-lightbox" onClick={() => setLightbox(null)}>
            <img src={im.url} alt="" onClick={e => e.stopPropagation()} />
            <div className="img-lightbox-bar" onClick={e => e.stopPropagation()}>
              <button className="pillbtn danger" onClick={() => removeImageAt(lightbox.blockId, lightbox.i)}>🗑 Rimuovi</button>
              <button className="pillbtn" onClick={() => setLightbox(null)}>Chiudi</button>
            </div>
          </div>
        )
      })()}

      {ghost && <div className="drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 10 }}>{shortText(ghost.text)}</div>}
      {toast && <div className="editor-toast">{toast}</div>}
    </div>
  )
}
