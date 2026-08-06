import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const allowedEmail = import.meta.env.VITE_ALLOWED_EMAIL as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
}

if (!allowedEmail) {
  throw new Error('Missing VITE_ALLOWED_EMAIL environment variable in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const ALLOWED_EMAIL = allowedEmail.toLowerCase()
