import { createClient } from "@supabase/supabase-js";

// ┌─────────────────────────────────────────────────────────────┐
// │  LIM INN DINE TO NØKLER FRA SUPABASE HER                     │
// │  Finnes i Supabase: Project Settings → API                  │
// └─────────────────────────────────────────────────────────────┘
export const SUPABASE_URL = "https://knlohksentudpixtocjk.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubG9oa3NlbnR1ZHBpeHRvY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MzcxODQsImV4cCI6MjA5NzMxMzE4NH0.ehBbgxo9yMe2q8LbCYT-TTRAzWHOqEQDay5R5ENNprk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const erKonfigurert = () =>
  SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
