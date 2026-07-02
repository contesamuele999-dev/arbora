// Import/Export di tutti i dati dell'utente in un singolo file JSON.
import { store } from './store.js'

export async function exportBackup() {
  const [vite, visioni, viste, links] = await Promise.all([
    store.list('vite'), store.list('visioni'), store.list('viste'), store.list('links'),
  ])
  const data = { app: 'arbora', version: 1, exportedAt: new Date().toISOString(), vite, visioni, viste, links }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `arbora-backup-${new Date().toISOString().slice(0,10)}.json`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
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
    const nv = await store.insert('viste', {
      visione_id: map[v.visione_id], titolo: v.titolo, blocchi: v.blocchi || [],
      is_template: v.is_template, livello: v.livello || 0, parent_id: null,
      pos_x: v.pos_x || 0, pos_y: v.pos_y || 0, ordine: v.ordine || 0,
      ...(v.stage ? { stage: v.stage } : {}),
    })
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
