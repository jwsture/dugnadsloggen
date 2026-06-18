import { createClient } from "@supabase/supabase-js";

// ┌─────────────────────────────────────────────────────────────┐
// │  LIM INN DINE TO NØKLER FRA SUPABASE HER                     │
// │  Finnes i Supabase: Project Settings → API                  │
// └─────────────────────────────────────────────────────────────┘
export const SUPABASE_URL = "https://knlohksentudpixtocjk.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_xh6aCYhU2zbUJNhhi6l_Og_5v66EvdW";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const erKonfigurert = () =>
  SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
