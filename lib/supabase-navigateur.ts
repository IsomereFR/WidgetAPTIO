'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase du navigateur.
 *
 * Il n'utilise QUE la clé anon. La RLS (§8 du PRD) n'autorise que le SELECT :
 * aucune écriture n'est possible depuis ce client, y compris si quelqu'un
 * l'appelle depuis la console du navigateur.
 *
 * Sert à deux choses : charger l'état et s'abonner au Realtime (page de lecture),
 * et porter la session Supabase Auth (page pilote, mode « auth »).
 */
let client: SupabaseClient | null = null

export function supabaseNavigateur(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !cle) return null

  if (!client) {
    client = createBrowserClient(url, cle)
  }
  return client
}
