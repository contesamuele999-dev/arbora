import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import * as gcal from '../lib/gcal.js'

// Sezione Profilo: cambio email e password dell'account.
export default function Profile() {
  const { user, isDemo, updateEmail, updatePassword } = useAuth()
  const [email, setEmail] = useState(user?.email || '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)   // { ok, text }
  const [calOn, setCalOn] = useState(() => gcal.isConnected(user?.id))
  const [calBusy, setCalBusy] = useState(false)

  const linkCalendar = async () => {
    setMsg(null); setCalBusy(true)
    try {
      await gcal.connect(user?.id)
      setCalOn(true)
      setMsg({ ok: true, text: 'Google Calendar collegato. Sincronizzo le scadenze esistenti…' })
      let n = 0
      try { n = await gcal.syncAllPending() } catch { /* best-effort */ }
      setMsg({
        ok: true,
        text: n > 0
          ? `Google Calendar collegato. ${n} scadenz${n === 1 ? 'a esistente segnata' : 'e esistenti segnate'} sul calendario.`
          : 'Google Calendar collegato. Le righe con scadenza verranno sincronizzate.',
      })
    } catch (e) {
      setMsg({ ok: false, text: 'Collegamento non riuscito: ' + (e?.message || 'errore') })
    } finally { setCalBusy(false) }
  }

  const unlinkCalendar = async () => {
    setCalBusy(true)
    try { await gcal.disconnect(user?.id) } catch { /* ignore */ }
    setCalOn(false); setCalBusy(false)
    setMsg({ ok: true, text: 'Google Calendar scollegato. Le nuove scadenze non verranno più sincronizzate.' })
  }

  const saveEmail = async (e) => {
    e.preventDefault()
    setMsg(null); setBusy('email')
    const { error } = await updateEmail(email.trim())
    setBusy('')
    setMsg(error ? { ok: false, text: error.message }
      : { ok: true, text: 'Email aggiornata. Controlla la casella per confermare il cambio.' })
  }

  const savePw = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (pw.length < 6) return setMsg({ ok: false, text: 'La password deve avere almeno 6 caratteri.' })
    if (pw !== pw2) return setMsg({ ok: false, text: 'Le due password non coincidono.' })
    setBusy('pw')
    const { error } = await updatePassword(pw)
    setBusy('')
    if (error) setMsg({ ok: false, text: error.message })
    else { setPw(''); setPw2(''); setMsg({ ok: true, text: 'Password aggiornata con successo.' }) }
  }

  return (
    <div className="profile">
      {isDemo && (
        <p className="demo-badge" style={{ display: 'inline-block', marginBottom: 16 }}>
          Modalità DEMO — configura Supabase per gestire davvero l’account
        </p>
      )}

      {msg && <div className={msg.ok ? 'ok-msg' : 'err'} style={{ marginBottom: 14 }}>{msg.text}</div>}

      <form onSubmit={saveEmail} className="profile-card">
        <h3>Email</h3>
        <div className="field">
          <label>Indirizzo email</label>
          <input className="input" type="email" required value={email}
            onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
        </div>
        <button className="btn" disabled={busy === 'email' || isDemo}>
          {busy === 'email' ? '…' : 'Aggiorna email'}
        </button>
      </form>

      <form onSubmit={savePw} className="profile-card">
        <h3>Password</h3>
        <div className="field">
          <label>Nuova password</label>
          <input className="input" type="password" value={pw} minLength={6}
            onChange={e => setPw(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="field">
          <label>Conferma password</label>
          <input className="input" type="password" value={pw2}
            onChange={e => setPw2(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn" disabled={busy === 'pw' || isDemo}>
          {busy === 'pw' ? '…' : 'Aggiorna password'}
        </button>
      </form>

      <div className="profile-card">
        <h3>Google Calendar</h3>
        {!gcal.hasGoogleCalendar ? (
          <p className="hint" style={{ margin: 0 }}>
            Integrazione non configurata: imposta <code>VITE_GOOGLE_CLIENT_ID</code> per abilitare
            il collegamento del calendario.
          </p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              Collega il tuo account Google per sincronizzare automaticamente le righe con scadenza
              come eventi nel tuo calendario. {calOn
                ? <b style={{ color: 'var(--ok, #1f7a4d)' }}>Collegato ✓</b>
                : 'Non collegato.'}
            </p>
            {calOn ? (
              <button className="btn danger" disabled={calBusy} onClick={unlinkCalendar}>
                {calBusy ? '…' : 'Scollega'}
              </button>
            ) : (
              <button className="btn" disabled={calBusy} onClick={linkCalendar}>
                {calBusy ? '…' : 'Collega Google Calendar'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
