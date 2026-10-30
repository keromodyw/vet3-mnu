import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://missing.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing'

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL is missing in this build')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
