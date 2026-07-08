// ============================================================
// Cache locale delle viste (anti-perdita dati).
// Ogni modifica viene scritta QUI in modo SINCRONO su localStorage,
// così sopravvive a refresh/chiusura app anche se il salvataggio
// cloud (asincrono) viene interrotto dall'unload della pagina.
// Al reload i dati locali "dirty" (non ancora confermati dal cloud)
// vengono uniti alle righe del server e ri-spediti.
// ============================================================
const KEY = 'arbora-vista-cache'
// Flag: la colonna `cestino` non esiste ancora su Supabase.
const NO_CESTINO = 'arbora-no-cestino-col'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
function write(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)) } catch { /* quota */ }
}

// Scrive (sincrono) le modifiche di una vista nella cache, marcandola "dirty".
export function cacheVistaLocal(id, patch) {
  if (!id) return
  const db = read()
  db[id] = { ...(db[id] || {}), ...patch, ts: Date.now(), dirty: true }
  write(db)
}

// Segna una vista come sincronizzata col cloud (non più dirty).
export function markVistaSynced(id) {
  const db = read()
  if (db[id]) { db[id].dirty = false; write(db) }
}

// Unisce le righe del server con la cache locale:
// se la cache ha una versione dirty (non confermata), vince quella.
export function mergeVisteWithCache(rows) {
  const db = read()
  if (!Object.keys(db).length) return rows
  return rows.map(r => {
    const c = db[r.id]
    if (!c || !c.dirty) return r
    const out = { ...r, titolo: c.titolo ?? r.titolo, blocchi: c.blocchi ?? r.blocchi }
    if (c.cestino !== undefined) out.cestino = c.cestino
    return out
  })
}

// Ri-spedisce al cloud tutte le viste rimaste "dirty" (best-effort).
export async function flushDirtyToCloud(store) {
  const db = read()
  const ids = Object.keys(db).filter(id => db[id]?.dirty)
  for (const id of ids) {
    const c = db[id]
    try {
      const patch = { titolo: c.titolo, blocchi: c.blocchi }
      if (c.cestino !== undefined && !cestinoDisabled()) patch.cestino = c.cestino
      await store.update('viste', id, patch)
      markVistaSynced(id)
    } catch (e) {
      if (isMissingCestino(e) && c.cestino !== undefined) {
        disableCestinoCloud()
        try { await store.update('viste', id, { titolo: c.titolo, blocchi: c.blocchi }); markVistaSynced(id) } catch { /* ritenta al prossimo reload */ }
      }
      /* se fallisce resta dirty: ritenteremo più avanti */
    }
  }
}

// ---- gestione colonna cestino mancante (fallback graduale) ----
export function cestinoDisabled() { return localStorage.getItem(NO_CESTINO) === '1' }
export function disableCestinoCloud() { try { localStorage.setItem(NO_CESTINO, '1') } catch {} }
export function isMissingCestino(e) {
  const m = ((e && (e.message || e.error || e.details)) || '').toString().toLowerCase()
  return m.includes('cestino') || m.includes('column') || e?.code === '42703' || e?.code === 'PGRST204'
}
