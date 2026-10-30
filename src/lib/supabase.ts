import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qakqhqzoarzfdnrhwliy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFha3FocXpvYXJ6ZmRucmh3bGl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzA5NDgsImV4cCI6MjEwODcwNjk0OH0.lsLU309Kz_Mj8BHaSBuDCkY_RGGZA0AR1PQjWqIv8To'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
