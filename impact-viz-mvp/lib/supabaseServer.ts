// lib/supabaseService.ts
import { createClient } from '@supabase/supabase-js';

export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!, // server only
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}