import { useEffect, useRef, useState, useCallback } from 'react'
import { RenderedBlock } from '../lib/markdown.jsx'

const uid = () => 'b-' + Math.random().toString(36).slice(2, 9)

// Editor della singola VISTA: blocchi markdown, drag&drop, copia tap,
// elimina doppio tap, undo/redo, sezioni (divider).
export default function Editor({ vista, onChange, onWikilink, focusMode }) {
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

  // re-sync se cambia la vista aperta
  useEffect(() => {
    setBlocks(vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }])
    setTitle(vista.titolo || '')
    undoStack.current = []; redoStack.current = []
  }, [vista.id])

  // salvataggio debounced
  const persist = useCallback((nextBlocks, nextTitle) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onChange({ ...vista, blocchi: nextBlocks, titolo: nextTitle })
    }, 400)
  }, [vista, onChange])

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

  const addBlock = (afterId = null, text = '') => {
    const nb = { id: uid(), text }
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
    if (blocks.length === 1) { commit([{ id: uid(), text: '' }]); return }
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

  // ---- drag & drop riordino ----
  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', blocks.find(b=>b.id===id)?.text || '') }
  const onDragOver = (e, id) => { e.preventDefault(); if (id !== dropId) setDropId(id) }
  const onDrop = (e, id) => {
    e.preventDefault()
    if (!dragId || dragId === id) { setDragId(null); setDropId(null); return }
    const from = blocks.findIndex(b => b.id === dragId)
    const to = blocks.findIndex(b => b.id === id)
    const next = [...blocks]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next)
    setDragId(null); setDropId(null)
  }

  const titleChange = (v) => { setTitle(v); persist(blocks, v) }

  return (
    <div className="editor">
      <input className="editor-title" value={title} placeholder="Titolo della vista…"
        onChange={e => titleChange(e.target.value)} />

      {!focusMode && (
        <div className="toolbar">
          <button className="iconbtn" title="Annulla (Ctrl+Z)" onClick={undo}>↶</button>
          <button className="iconbtn" title="Ripeti (Ctrl+Y)" onClick={redo}>↷</button>
          <button className="iconbtn" title="Titolo" onClick={() => editing && setText(editing, '# ' + (blocks.find(b=>b.id===editing)?.text||''))}>H</button>
          <button className="iconbtn" title="Grassetto" onClick={() => editing && setText(editing, (blocks.find(b=>b.id===editing)?.text||'') + '**testo**')}><b>B</b></button>
          <button className="iconbtn" title="Corsivo" onClick={() => editing && setText(editing, (blocks.find(b=>b.id===editing)?.text||'') + '*testo*')}><i>I</i></button>
          <button className="iconbtn" title="Sezione / divisore" onClick={() => addBlock(editing, '---')}>—</button>
          <button className="iconbtn" title="Link a vista [[...]]" onClick={() => editing && setText(editing, (blocks.find(b=>b.id===editing)?.text||'') + '[[Titolo vista]]')}>🔗</button>
        </div>
      )}

      {blocks.map(b => (
        <div key={b.id}
          className={'block' + (dragId === b.id ? ' dragging' : '') + (dropId === b.id ? ' drop-target' : '')}
          draggable={editing !== b.id}
          onDragStart={e => onDragStart(e, b.id)}
          onDragOver={e => onDragOver(e, b.id)}
          onDrop={e => onDrop(e, b.id)}
          onDragEnd={() => { setDragId(null); setDropId(null) }}
        >
          <span className="handle" title="Trascina">⠿</span>
          {editing === b.id ? (
            <textarea autoFocus value={b.text} rows={Math.max(1, b.text.split('\n').length)}
              onChange={e => setText(b.id, e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBlock(b.id) }
                if (e.key === 'Backspace' && b.text === '') { e.preventDefault(); deleteBlock(b.id) }
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
      ))}

      <button className="add-btn" style={{marginTop:12}} onClick={() => addBlock(null)}>＋ Aggiungi blocco</button>
    </div>
  )
}
