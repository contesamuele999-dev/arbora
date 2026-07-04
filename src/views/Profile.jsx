import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

// Sezione Profilo: cambio email e password dell'account.
export default function Profile() {
  const { user, isDemo, updateEmail, updatePassword } = useAuth()
  const [email, setEmail] = useState(user?.email || '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)   // { ok, text }

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
    </div>
  )
}
