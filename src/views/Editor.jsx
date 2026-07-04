import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { RenderedBlock } from '../lib/markdown.jsx'
import { logChars } from '../lib/activity.js'

const uid = () => 'b-' + Math.random().toString(36).slice(2, 9)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MAX_INDENT = 6
const INDENT_PX = 22     // rientro visivo per livello
const INDENT_STEP = 26   // px di trascinamento orizzontale per cambiare livello

// Racchiude la prima occorrenza "libera" di `name` (non già dentro (( )) o [[ ]]) in un collegamento.
function linkifyName(text, name) {
  const re = new RegExp('(?<![\\(\\[])\\b' + escapeRe(name) + '\\b(?![\\)\\]])', 'i')
  return text.replace(re, (match) => '((' + match + '))')
}

const totalChars = (blocks) => (blocks || []).reduce((n, b) => n + (b.text?.length || 0), 0)

// Editor della singola VISTA: blocchi markdown, drag&drop (riordino + nidificazione),
// copia tap, elimina doppio tap, undo/redo, sezioni (divider).
export default function Editor({ vista, onChange, onWikilink, focusMode, allViste = [] }) {
  const [blocks, setBlocks] = useState(vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }])
  const [title, setTitle] = useState(vista.titolo || '')
  const [editing, setEditing] = useState(null)     // id del blocco in edit
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [flash, setFlash] = useState(null)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const lastTap = useRef({ id: null, t: 0 })
  const saveTimer = useRef(null)
  const lastEdit = useRef(null)          // ultimo blocco editato: i tasti toolbar agiscono su questo
  const dragStartX = useRef(0)
  const prevChars = useRef(totalChars(vista.blocchi))
  const pending = useRef(null)           // { blocks, title } da salvare al volo se si esce

  useEffect(() => { if (editing) lastEdit.current = editing }, [editing])

  // re-sync se cambia la vista aperta
  useEffect(() => {
    setBlocks(vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }])
    setTitle(vista.titolo || '')
    prevChars.current = totalChars(vista.blocchi)
    undoStack.current = []; redoStack.current = []
  }, [vista.id])

  // salvataggio debounced (+ log caratteri scritti)
  const persist = useCallback((nextBlocks, nextTitle) => {
    pending.current = { blocks: nextBlocks, title: nextTitle }
    const now = totalChars(nextBlocks)
    logChars(now - prevChars.current)
    prevChars.current = now
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pending.current = null
      onChange({ ...vista, blocchi: nextBlocks, titolo: nextTitle })
    }, 400)
  }, [vista, onChange])

  // Flush immediato: salva subito le modifiche in sospeso (uscita app / chiusura vista).
  const flush = useCallback(() => {
    if (!pending.current) return
    clearTimeout(saveTimer.current)
    const { blocks: b, title: t } = pending.current
    pending.current = null
    onChange({ ...vista, blocchi: b, titolo: t })
  }, [vista, onChange])

  // Salva quando l'app va in background o si chiude, e allo smontaggio.
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

  const pushUndo = (snapshot) => {
    undoStack.current.push(JSON.stringify(snapshot))
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
  }

  const commit = (next, { undo = true } = {}) => {
    if (undo) pushUndo(blocks)
    setBlocks(next)
    persist(next, title)
  }

  const undo = () => {
    if (!undoStack.current.length) return
    redoStack.current.push(JSON.stringify(blocks))
    const prev = JSON.parse(undoStack.current.pop())
    setBlocks(prev); persist(prev, title)
  }
  const redo = () => {
    if (!redoStack.current.length) return
    undoStack.current.push(JSON.stringify(blocks))
    const next = JSON.parse(redoStack.current.pop())
    setBlocks(next); persist(next, title)
  }

  // keyboard shortcuts undo/redo
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const setText = (id, text) => {
    const next = blocks.map(b => b.id === id ? { ...b, text } : b)
    setBlocks(next); persist(next, title)
  }

  const setIndent = (id, indent) => {
    const next = blocks.map(b => b.id === id ? { ...b, indent } : b)
    commit(next)
  }

  const addBlock = (afterId = null, text = '') => {
    // il nuovo blocco eredita il rientro del blocco precedente
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

  const deleteBlock = (id) => {
    if (blocks.length === 1) { commit([{ id: uid(), text: '', indent: 0 }]); return }
    commit(blocks.filter(b => b.id !== id))
  }

  // ---- copia con singolo tap su testo (quando non in edit) ----
  const copyBlock = (b) => {
    navigator.clipboard?.writeText(b.text).catch(() => {})
    setFlash(b.id)
    setTimeout(() => setFlash(null), 700)
  }

  // ---- doppio tap = elimina ----
  const handleTap = (b) => {
    const now = Date.now()
    if (lastTap.current.id === b.id && now - lastTap.current.t < 350) {
      lastTap.current = { id: null, t: 0 }
      deleteBlock(b.id)
    } else {
      lastTap.current = { id: b.id, t: now }
      copyBlock(b)
    }
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
    if (!dragId) { setDragId(null); setDropId(null); return }
    applyDrag(id, e.clientX)
    setDragId(null); setDropId(null)
  }

  const titleChange = (v) => { setTitle(v); persist(blocks, v) }

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

  return (
    <div className="editor">
      <input className="editor-title" value={title} placeholder="Titolo della vista…"
        onChange={e => titleChange(e.target.value)} />

      {!focusMode && (
        <>
        <div className="link-hint">💡 Scrivi <code>((Nome vista))</code> — oppure usa il tasto 🔗 — per creare un collegamento. Trascina un blocco a <b>destra/sinistra</b> per nidificarlo in una lista a più livelli.</div>
        {/* onPointerDown preventDefault: il textarea non perde il focus quando si preme un tasto della toolbar */}
        <div className="toolbar" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
          <button className="iconbtn" title="Annulla (Ctrl+Z)" onClick={undo}>↶</button>
          <button className="iconbtn" title="Ripeti (Ctrl+Y)" onClick={redo}>↷</button>
          <button className="iconbtn" title="Titolo" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, '# ' + (blocks.find(b=>b.id===id)?.text||'')) }}>H</button>
          <button className="iconbtn" title="Grassetto" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, (blocks.find(b=>b.id===id)?.text||'') + '**testo**') }}><b>B</b></button>
          <button className="iconbtn" title="Corsivo" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, (blocks.find(b=>b.id===id)?.text||'') + '*testo*') }}><i>I</i></button>
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

      {blocks.map(b => {
        const indent = b.indent || 0
        return (
        <div key={b.id}
          className={'block' + (dragId === b.id ? ' dragging' : '') + (dropId === b.id ? ' drop-target' : '') + (indent ? ' nested' : '')}
          style={{ marginLeft: indent * INDENT_PX }}
          draggable={editing !== b.id}
          onDragStart={e => onDragStart(e, b.id)}
          onDragOver={e => onDragOver(e, b.id)}
          onDrop={e => onDrop(e, b.id)}
          onDragEnd={() => { setDragId(null); setDropId(null) }}
        >
          <span className="handle" title="Trascina · dx/sx per nidificare">⠿</span>
          {indent > 0 && isPlain(b.text) && editing !== b.id && <span className="nest-bullet">•</span>}
          {editing === b.id ? (
            <textarea autoFocus value={b.text} rows={Math.max(1, b.text.split('\n').length)}
              onChange={e => setText(b.id, e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBlock(b.id) }
                if (e.key === 'Backspace' && b.text === '') { e.preventDefault(); deleteBlock(b.id) }
                if (e.key === 'Tab') { e.preventDefault(); const i = blocks.findIndex(x=>x.id===b.id); if (e.shiftKey) setIndent(b.id, Math.max(0,(b.indent||0)-1)); else setIndent(b.id, Math.min(maxIndentFor(blocks, i),(b.indent||0)+1)) }
              }} />
          ) : (
            <div className="rendered" onClick={() => handleTap(b)} onDoubleClick={() => deleteBlock(b.id)}
              title="Tap: copia · Doppio tap: elimina · Clicca matita per modificare">
              {b.text ? <RenderedBlock text={b.text} onWikilink={onWikilink} /> : <span style={{color:'var(--text-dim)'}}>Vuoto — tocca ✎ per scrivere</span>}
            </div>
          )}
          <button className="iconbtn" style={{width:28,height:28,fontSize:12}} title="Modifica"
            onClick={() => setEditing(editing === b.id ? null : b.id)}>✎</button>
          <span className={'copytap' + (flash === b.id ? ' copied-flash' : '')}>{flash === b.id ? 'copiato!' : 'copia'}</span>
        </div>
        )
      })}

      <button className="add-btn" style={{marginTop:12}} onClick={() => addBlock(null)}>＋ Aggiungi blocco</button>
    </div>
  )
}
