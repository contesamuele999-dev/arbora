// ============================================================
// Store dati Arbora
// Astrazione che funziona sia con Supabase (cloud sync) sia in
// modalità DEMO locale (IndexedDB-like via localStorage) quando
// Supabase non è configurato. Così l'app gira sempre.
// ============================================================
import { supabase, hasSupabase } from './supabase'

const LS_KEY = 'arbora-demo-db'

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || seed() }
  catch { return seed() }
}
function saveLocal(db) { localStorage.setItem(LS_KEY, JSON.stringify(db)) }
function uid() { return 'id-' + Math.random().toString(36).slice(2, 10) }

function seed() {
  const vitaId = uid(), visId = uid(), v1 = uid(), v2 = uid(), v3 = uid()
  const db = {
    vite: [{ id: vitaId, titolo: 'La mia impresa', colore: '#1f7a4d', ordine: 0 }],
    visioni: [{ id: visId, vita_id: vitaId, titolo: 'Lancio prodotto', colore: '#2e9e63', ordine: 0 }],
    viste: [
      { id: v1, visione_id: visId, titolo: 'Idea centrale', livello: 0, parent_id: null, pos_x: 0, pos_y: 0,
        blocchi: [
          { id: uid(), text: '# Idea centrale' },
          { id: uid(), text: 'Costruire **Arbora**, l\'app di note ad albero.' },
          { id: uid(), text: 'Vedi i dettagli in [[Strategia]] e [[Roadmap]].' },
        ] },
      { id: v2, visione_id: visId, titolo: 'Strategia', livello: 1, parent_id: v1, pos_x: -180, pos_y: 140,
        blocchi: [{ id: uid(), text: '# Strategia' }, { id: uid(), text: '- Target: imprenditori' }, { id: uid(), text: '- Canale: PWA cross-device' }] },
      { id: v3, visione_id: visId, titolo: 'Roadmap', livello: 1, parent_id: v1, pos_x: 180, pos_y: 140,
        blocchi: [{ id: uid(), text: '# Roadmap' }, { id: uid(), text: '1. MVP editor' }, { id: uid(), text: '2. Mappa 2.5D' }] },
    ],
    links: [
      { id: uid(), da_vista: v1, a_vista: v2, tipo: 'maggiore' },
      { id: uid(), da_vista: v1, a_vista: v3, tipo: 'maggiore' },
    ],
  }
  saveLocal(db)
  return db
}

// ---------- API unificata ----------
export const store = {
  isCloud: hasSupabase,

  async list(table, filter = {}) {
    if (hasSupabase) {
      let q = supabase.from(table).select('*')
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
      // NB: la tabella `links` NON ha la colonna `ordine` -> ordiniamo solo per created_at,
      // altrimenti Supabase risponde "column links.ordine does not exist" e la lettura fallisce.
      const orderCols = table === 'links' ? ['created_at'] : ['ordine', 'created_at']
      for (const c of orderCols) q = q.order(c, { ascending: true })
      const { data, error } = await q
      if (error) throw error
      return data
    }
    const db = loadLocal()
    return (db[table] || []).filter(row => Object.entries(filter).every(([k, v]) => row[k] === v))
  },

  async insert(table, row) {
    if (hasSupabase) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from(table).insert({ ...row, user_id: user.id }).select().single()
      if (error) throw error
      return data
    }
    const db = loadLocal()
    const newRow = { id: uid(), created_at: new Date().toISOString(), ...row }
    db[table] = [...(db[table] || []), newRow]
    saveLocal(db)
    return newRow
  },

  async update(table, id, patch) {
    if (hasSupabase) {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single()
      if (error) throw error
      return data
    }
    const db = loadLocal()
    db[table] = (db[table] || []).map(r => r.id === id ? { ...r, ...patch } : r)
    saveLocal(db)
    return db[table].find(r => r.id === id)
  },

  async remove(table, id) {
    if (hasSupabase) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      return
    }
    const db = loadLocal()
    db[table] = (db[table] || []).filter(r => r.id !== id)
    saveLocal(db)
  },

  // ---------- Allegati immagine (Supabase Storage) ----------
  // Carica un blob immagine nel bucket 'vista-immagini' sotto la cartella dell'utente
  // e ritorna { url, path }. In modalità demo non viene chiamata (si usa base64).
  async uploadImage(blob, vistaId) {
    if (!hasSupabase) throw new Error('Storage non disponibile in modalità demo')
    const { data: { user } } = await supabase.auth.getUser()
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const path = `${user.id}/${vistaId}/${name}`
    const { error } = await supabase.storage.from('vista-immagini')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('vista-immagini').getPublicUrl(path)
    return { url: data.publicUrl, path }
  },

  async removeImage(path) {
    if (!hasSupabase || !path) return
    await supabase.storage.from('vista-immagini').remove([path])
  },
}
