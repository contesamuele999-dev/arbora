// Import/Export di tutti i dati dell'utente in un singolo file JSON.
import { store } from './store.js'

export async function exportBackup() {
  let data
  try {
    const [vite, visioni, viste, links] = await Promise.all([
      store.list('vite'), store.list('visioni'), store.list('viste'), store.list('links'),
    ])
    data = { app: 'arbora', version: 1, exportedAt: new Date().toISOString(), vite, visioni, viste, links }
  } catch (e) {
    alert('Impossibile leggere i dati per il backup: ' + (e?.message || e))
    throw e
  }

  const json = JSON.stringify(data, null, 2)
  const filename = `arbora-backup-${new Date().toISOString().slice(0,10)}.json`
  const blob = new Blob([json], { type: 'application/json' })

  // 1) Su mobile / PWA (dove il download via <a> spesso non parte) usa la condivisione file.
  try {
    if (navigator.canShare && typeof File !== 'undefined') {
      const file = new File([blob], filename, { type: 'application/json' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup Arbora' })
        return
      }
    }
  } catch (e) {
    // l'utente ha annullato la condivisione: non è un errore da segnalare
    if (e?.name === 'AbortError') return
    // altrimenti proviamo il download classico qui sotto
  }

  // 2) Download classico via link temporaneo.
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return
  } catch (e) {
    // 3) Ultima spiaggia: apri i dati in una nuova scheda così l'utente può salvarli a mano.
    try {
      const w = window.open('', '_blank')
      if (w) { w.document.title = filename; w.document.body.style.whiteSpace = 'pre-wrap'; w.document.body.textContent = json; return }
    } catch {}
    alert('Esportazione non riuscita su questo dispositivo: ' + (e?.message || e))
    throw e
  }
}

export async function importBackup(file) {
  const text = await file.text()
  const data = JSON.parse(text)
  if (data.app !== 'arbora') throw new Error('File non valido (non è un backup Arbora).')

  // mappa vecchi id -> nuovi id, per ricreare i collegamenti
  const map = {}
  for (const v of data.vite || []) {
    const nv = await store.insert('vite', { titolo: v.titolo, colore: v.colore, ordine: v.ordine })
    map[v.id] = nv.id
  }
  for (const v of data.visioni || []) {
    const nv = await store.insert('visioni', { vita_id: map[v.vita_id], titolo: v.titolo, colore: v.colore, ordine: v.ordine })
    map[v.id] = nv.id
  }
  for (const v of data.viste || []) {
    const base = {
      visione_id: map[v.visione_id], titolo: v.titolo, blocchi: v.blocchi || [],
      is_template: v.is_template, livello: v.livello || 0, parent_id: null,
      pos_x: v.pos_x || 0, pos_y: v.pos_y || 0, ordine: v.ordine || 0,
      ...(v.stage ? { stage: v.stage } : {}),
    }
    let nv
    try {
      nv = await store.insert('viste', { ...base, ...(v.cestino ? { cestino: v.cestino } : {}) })
    } catch (e) {
      // colonna cestino non ancora presente su Supabase: reinserisci senza
      nv = await store.insert('viste', base)
    }
    map[v.id] = nv.id
  }
  // seconda passata: collega parent_id
  for (const v of data.viste || []) {
    if (v.parent_id && map[v.parent_id]) await store.update('viste', map[v.id], { parent_id: map[v.parent_id] })
  }
  for (const l of data.links || []) {
    if (map[l.da_vista] && map[l.a_vista]) {
      try { await store.insert('links', { da_vista: map[l.da_vista], a_vista: map[l.a_vista], tipo: l.tipo || 'maggiore' }) } catch {}
    }
  }
}
