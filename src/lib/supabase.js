import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se le variabili non sono configurate, l'app gira comunque in modalità DEMO (locale).
export const hasSupabase = Boolean(url && key)

export const supabase = hasSupabase
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null
