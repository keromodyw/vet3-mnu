import { createClient } from '@supabase/supabase-js'

// Same Supabase project as yalla-nezaker, but ALL data lives in its own Postgres schema: el_dof3a_events.
// The anon key is public by design; real protection is RLS + the SQL functions.
const supabaseUrl = 'https://qakqhqzoarzfdnrhwliy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFha3FocXpvYXJ6ZmRucmh3bGl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzA5NDgsImV4cCI6MjEwODcwNjk0OH0.lsLU309Kz_Mj8BHaSBuDCkY_RGGZA0AR1PQjWqIv8To'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'el_dof3a_events' },
  // separate storage key so staff sessions never collide with the other app on this domain
  auth: { storageKey: 'md-auth', persistSession: true, autoRefreshToken: true },
})
