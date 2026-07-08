import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { RenderedBlock } from '../lib/markdown.jsx'
import { logChars } from '../lib/activity.js'

const uid = () => 'b-' + Math.random().toString(36).slice(2, 9)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MAX_INDENT = 6
const INDENT_PX = 22     // larghezza di ogni guida di rientro (= un livello)
const INDENT_STEP = 26   // px di trascinamento orizzontale per cambiare livello
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
// colori delle guide di tabulazione: un colore per livello, per distinguerli a colpo d'occhio
const GUIDE_COLORS = ['var(--green-deep)', 'var(--green)', 'var(--green-bright)', 'var(--accent)', 'var(--green)', 'var(--green-bright)']

// Racchiude la prima occorrenza "libera" di `name` (non già dentro (( )) o [[ ]]) in un collegamento.
function linkifyName(text, name) {
  const re = new RegExp('(?<![\\(\\[])\\b' + escapeRe(name) + '\\b(?![\\)\\]])', 'i')
  return text.replace(re, (match) => '((' + match + '))')
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

// Editor della singola VISTA: blocchi markdown, drag&drop (riordino + nidificazione),
// click=modifica · doppio click=copia · icona cestino=elimina (con recupero 7 giorni),
// selezione multipla per ri-tabulare interi blocchi, copia intero foglio, undo/redo.
export default function Editor({ vista, onChange, onWikilink, focusMode, allViste = [] }) {
  const [blocks, setBlocks] = useState(vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }])
  const [title, setTitle] = useState(vista.titolo || '')
  const [trash, setTrash] = useState(purgeTrash(vista.cestino))
  const [editing, setEditing] = useState(null)     // id del blocco in edit
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [showTrash, setShowTrash] = useState(false)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const saveTimer = useRef(null)
  const lastEdit = useRef(null)          // ultimo blocco editato: i tasti toolbar agiscono su questo
  const dragStartX = useRef(0)
  const clickTimer = useRef(null)        // discrimina click (modifica) da doppio-click (copia)
  const prevChars = useRef(totalChars(vista.blocchi))
  const pending = useRef(null)           // { blocks, title, trash } da salvare al volo se si esce

  useEffect(() => { if (editing) lastEdit.current = editing }, [editing])

  // re-sync se cambia la vista aperta (+ pulizia cestino oltre 7 giorni)
  useEffect(() => {
    const b = vista.blocchi?.length ? vista.blocchi : [{ id: uid(), text: '' }]
    const cleanTrash = purgeTrash(vista.cestino)
    setBlocks(b)
    setTitle(vista.titolo || '')
    setTrash(cleanTrash)
    setEditing(null); setSelectMode(false); setSelected(new Set()); setShowTrash(false)
    prevChars.current = totalChars(vista.blocchi)
    undoStack.current = []; redoStack.current = []
    // se la pulizia ha rimosso qualcosa, salva il cestino ripulito
    if ((vista.cestino || []).length !== cleanTrash.length) {
      onChange({ ...vista, blocchi: b, titolo: vista.titolo || '', cestino: cleanTrash })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista.id])

  // salvataggio debounced (+ log caratteri scritti). Include sempre titolo e cestino correnti.
  const persist = (nextBlocks, nextTitle = title, nextTrash = trash) => {
    pending.current = { blocks: nextBlocks, title: nextTitle, trash: nextTrash }
    const now = totalChars(nextBlocks)
    logChars(now - prevChars.current)
    prevChars.current = now
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pending.current = null
      onChange({ ...vista, blocchi: nextBlocks, titolo: nextTitle, cestino: nextTrash })
    }, 400)
  }

  // Flush immediato: salva subito le modifiche in sospeso (uscita app / chiusura vista).
  const flush = useCallback(() => {
    if (!pending.current) return
    clearTimeout(saveTimer.current)
    const { blocks: b, title: t, trash: tr } = pending.current
    pending.current = null
    onChange({ ...vista, blocchi: b, titolo: t, cestino: tr })
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
    setBlocks(next); persist(next, title, trash)
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
  const copySelected = () => {
    const text = blocks.filter(b => selected.has(b.id)).map(b => '  '.repeat(b.indent || 0) + b.text).join('\n')
    if (!text) return
    navigator.clipboard?.writeText(text).catch(() => {})
    setToast('Righe copiate'); setTimeout(() => setToast(''), 1200)
  }

  // ---- click = modifica · doppio click = copia (con discriminatore) ----
  const activateBlock = (b) => {
    if (selectMode) { toggleSelect(b.id); return }
    if (clickTimer.current) return               // arriverà il doppio click
    clickTimer.current = setTimeout(() => { clickTimer.current = null; setEditing(b.id) }, 230)
  }
  const doubleBlock = (b) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    if (selectMode) return
    copyBlock(b)
  }

  // ---- selezione multipla per ri-tabulare / copiare interi blocchi ----
  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
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

  const titleChange = (v) => { setTitle(v); persist(blocks, v, trash) }

  // ---- grassetto / corsivo: avvolge la selezione del textarea (Ctrl/Cmd+B / +I) ----
  const applyWrap = (el, id, mark) => {
    const s = el.selectionStart, e = el.selectionEnd, val = el.value
    const sel = val.slice(s, e) || 'testo'
    const nv = val.slice(0, s) + mark + sel + mark + val.slice(e)
    setText(id, nv)
    const ns = s + mark.length, ne = ns + sel.length
    requestAnimationFrame(() => { try { el.focus(); el.selectionStart = ns; el.selectionEnd = ne } catch {} })
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

  return (
    <div className="editor">
      <input className="editor-title" value={title} placeholder="Titolo della vista…"
        onChange={e => titleChange(e.target.value)} />

      {!focusMode && (
        <>
        <div className="link-hint">💡 <b>Click</b> su una riga = modifica · <b>doppio click</b> = copia · icona 🗑 = elimina (recuperabile 7 giorni). Trascina a <b>destra/sinistra</b> per nidificare. Nel testo: <code>Ctrl/⌘+B</code> grassetto, <code>Ctrl/⌘+I</code> corsivo.</div>
        {/* onPointerDown preventDefault: il textarea non perde il focus quando si preme un tasto della toolbar */}
        <div className="toolbar" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
          <button className="iconbtn" title="Annulla (Ctrl+Z)" onClick={undo}>↶</button>
          <button className="iconbtn" title="Ripeti (Ctrl+Y)" onClick={redo}>↷</button>
          <button className="iconbtn" title="Titolo" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, '# ' + (blocks.find(b=>b.id===id)?.text||'')) }}>H</button>
          <button className="iconbtn" title="Grassetto (Ctrl/⌘+B)" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, (blocks.find(b=>b.id===id)?.text||'') + '**testo**') }}><b>B</b></button>
          <button className="iconbtn" title="Corsivo (Ctrl/⌘+I)" onClick={() => { const id = editing || lastEdit.current; if (id) setText(id, (blocks.find(b=>b.id===id)?.text||'') + '*testo*') }}><i>I</i></button>
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

        {/* Riga azioni: copia foglio · selezione multipla · cestino */}
        <div className="toolbar toolbar-2" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()}>
          {!selectMode ? (
            <>
              <button className="pillbtn" title="Copia tutto il foglio" onClick={copySheet}>⧉ Copia foglio</button>
              <button className="pillbtn" title="Seleziona più righe per ri-tabularle insieme" onClick={() => { setSelectMode(true); setEditing(null) }}>☑ Seleziona</button>
              <button className={'pillbtn' + (showTrash ? ' on' : '')} title="Righe eliminate (ultimi 7 giorni)" onClick={() => setShowTrash(s => !s)}>🗑 Cestino{trash.length ? ` (${trash.length})` : ''}</button>
            </>
          ) : (
            <>
              <span className="sel-count">{selected.size} selezionate</span>
              <button className="pillbtn" title="Aumenta rientro delle righe selezionate" onClick={() => indentSelected(1)}>⇥ Rientra</button>
              <button className="pillbtn" title="Riduci rientro delle righe selezionate" onClick={() => indentSelected(-1)}>⇤ Riduci</button>
              <button className="pillbtn" title="Copia le righe selezionate" onClick={copySelected}>⧉ Copia</button>
              <button className="pillbtn danger" title="Chiudi selezione" onClick={exitSelect}>✕ Fine</button>
            </>
          )}
        </div>
        </>
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
        const isSel = selected.has(b.id)
        return (
        <div key={b.id}
          className={'block' + (dragId === b.id ? ' dragging' : '') + (dropId === b.id ? ' drop-target' : '') + (indent ? ' nested' : '') + (isSel ? ' selected' : '')}
          draggable={editing !== b.id && !selectMode}
          onDragStart={e => onDragStart(e, b.id)}
          onDragOver={e => onDragOver(e, b.id)}
          onDrop={e => onDrop(e, b.id)}
          onDragEnd={() => { setDragId(null); setDropId(null) }}
        >
          {/* guide di tabulazione: una barra colorata per livello */}
          {Array.from({ length: indent }).map((_, i) => (
            <span key={i} className="indent-guide" style={{ borderColor: GUIDE_COLORS[i % GUIDE_COLORS.length] }} />
          ))}
          {selectMode && (
            <span className={'sel-box' + (isSel ? ' on' : '')} onClick={() => toggleSelect(b.id)}>{isSel ? '✓' : ''}</span>
          )}
          <span className="handle" title="Trascina · dx/sx per nidificare">⠿</span>
          {indent > 0 && <span className="level-badge" title={'Livello ' + indent}>{indent}</span>}
          {indent > 0 && isPlain(b.text) && editing !== b.id && <span className="nest-bullet">•</span>}
          {editing === b.id ? (
            <textarea autoFocus value={b.text} rows={Math.max(1, b.text.split('\n').length)}
              onChange={e => setText(b.id, e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={e => {
                const el = e.target
                if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); applyWrap(el, b.id, '**') }
                else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); applyWrap(el, b.id, '*') }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBlock(b.id) }
                else if (e.key === 'Backspace' && b.text === '') { e.preventDefault(); deleteBlock(b.id) }
                else if (e.key === 'Tab') { e.preventDefault(); const i = blocks.findIndex(x=>x.id===b.id); if (e.shiftKey) setIndent(b.id, Math.max(0,(b.indent||0)-1)); else setIndent(b.id, Math.min(maxIndentFor(blocks, i),(b.indent||0)+1)) }
              }} />
          ) : (
            <div className="rendered" onClick={() => activateBlock(b)} onDoubleClick={() => doubleBlock(b)}
              title="Click: modifica · Doppio click: copia">
              {b.text ? <RenderedBlock text={b.text} onWikilink={onWikilink} /> : <span style={{color:'var(--text-dim)'}}>Vuoto — clicca per scrivere</span>}
            </div>
          )}
          <span className={'copytap' + (flash === b.id ? ' copied-flash' : '')}>{flash === b.id ? 'copiato!' : ''}</span>
          {!selectMode && (
            <button className="iconbtn row-del" title="Elimina riga (recuperabile 7 giorni)"
              onClick={() => deleteBlock(b.id)}>🗑</button>
          )}
        </div>
        )
      })}

      <button className="add-btn" style={{marginTop:12}} onClick={() => addBlock(null)}>＋ Aggiungi blocco</button>

      {toast && <div className="editor-toast">{toast}</div>}
    </div>
  )
}
