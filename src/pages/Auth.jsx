import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

export default function Auth() {
  const { signIn, signUp, isDemo } = useAuth()
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    const fn = mode === 'in' ? signIn : signUp
    const { error } = await fn(email, pw)
    setBusy(false)
    if (error) setErr(error.message)
    else if (mode === 'up') setMsg('Registrazione ok! Controlla la mail per confermare, poi accedi.')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="44" alt="Arbora" />
        <h1>Arbora</h1>
        <p className="sub">Le tue idee, ad albero. Vite · Visioni · Viste.</p>

        {isDemo && (
          <p className="demo-badge" style={{display:'inline-block',marginBottom:16}}>
            Modalità DEMO locale — configura Supabase per il login reale
          </p>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required minLength={6} value={pw}
              onChange={e => setPw(e.target.value)} placeholder="••••••••" />
          </div>
          {err && <div className="err">{err}</div>}
          {msg && <div style={{color:'var(--green-bright)',fontSize:13,margin:'8px 0'}}>{msg}</div>}
          <button className="btn" disabled={busy}>
            {busy ? '…' : mode === 'in' ? 'Accedi' : 'Crea account'}
          </button>
        </form>

        <div style={{textAlign:'center',marginTop:12}}>
          <button className="link-btn" onClick={() => { setMode(mode==='in'?'up':'in'); setErr(''); setMsg('') }}>
            {mode === 'in' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
          </button>
        </div>
      </div>
    </div>
  )
}
