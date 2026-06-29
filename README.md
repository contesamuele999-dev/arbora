# 🌳 Arbora

App di note ad albero per imprenditori. **Vite** (universi) → **Visioni** (mondi/progetti) → **Viste** (i singoli fogli/note).

PWA installabile su PC, tablet e smartphone. React + Vite + Supabase, deploy su GitHub Pages.

---

## Cosa fa

- **Editor a blocchi markdown** — titoli, grassetto, corsivo, code, divisori. Ogni blocco si trascina (drag & drop), si copia con un tap, si elimina con doppio tap. Undo/redo (Ctrl+Z / Ctrl+Y).
- **Hyperlink tra viste** — scrivi `[[Titolo]]`; cliccando salti alla vista collegata (creata se non esiste).
- **Vista Mappa** commutabile: **2.5D**, **mappa mentale** (radiale), **albero**. Filtro per livello gerarchico.
- **Vista Pipeline** stile Google Keep.
- **Scheda Livelli** — trascina le viste per cambiare ramo/livello (con conferma).
- **Modalità Focus + Pomodoro** — timer 25+5 editabile fino a 50+10, con suggerimenti di pausa.
- **Login multi-utente** — ogni utente vede solo i propri dati (Supabase + Row Level Security).
- **Modalità DEMO** — senza Supabase l'app gira in locale (dati nel browser), utile per provarla subito.

---

## Avvio rapido (locale)

```bash
npm install
npm run dev
```

Apri l'indirizzo mostrato. Senza configurare Supabase parte in **modalità DEMO** locale.

---

## Setup Supabase (login + sync cloud)

1. Crea un progetto su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla ed esegui il contenuto di [`supabase_schema.sql`](./supabase_schema.sql).
3. **Project Settings → API**: copia *Project URL* e *anon public key*.
4. Crea un file `.env` (vedi `.env.example`):

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
5. (Opzionale) **Authentication → Providers**: tieni attivo Email. Per test rapidi puoi disattivare la conferma email.
6. `npm run dev` → ora il login è reale.

---

## Pubblicazione su GitHub Pages

1. Crea un repo su GitHub chiamato **`arbora`** e carica questa cartella.
2. **Settings → Secrets and variables → Actions** → aggiungi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages** → *Source: GitHub Actions*.
4. `git push` sul branch `main`: il workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) builda e pubblica.
5. L'app sarà su `https://<tuo-utente>.github.io/arbora/`.

> Se chiami il repo diversamente da `arbora`, cambia `VITE_BASE` nel workflow (es. `/mio-repo/`).
> Per un dominio custom o un repo `<utente>.github.io`, imposta `VITE_BASE=/`.

---

## Struttura

```
src/
  lib/        supabase.js · store.js (cloud+demo) · auth.jsx · markdown.jsx
  views/      Editor · MapView · Pipeline · Levels · Pomodoro
  pages/      Auth · Legal (privacy + termini)
  App.jsx     orchestratore (mondi, viste, hyperlink, focus)
supabase_schema.sql   schema DB + Row Level Security
```

---

## Note

- Le pagine **Privacy** e **Termini** sono una base in italiano: falle rivedere a un legale prima di aprire l'app al pubblico.
- L'editor markdown è volutamente leggero (zero dipendenze pesanti) per massima fluidità.

---

Arbora © 2026 — Sviluppata da **Samuele Contessa**.
