import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Client « service role » : réservé au serveur, seul habilité à écrire.
 *
 * La clé n'est jamais préfixée NEXT_PUBLIC_ et ce module est marqué `server-only`,
 * ce qui fait échouer la compilation si un composant client tente de l'importer.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cleService) return null

  return createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Client anon côté serveur, utilisé pour le rendu initial de la page de lecture.
 * Soumis à la RLS, donc en lecture seule lui aussi.
 */
export function supabaseLectureServeur(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !cleAnon) return null

  return createClient(url, cleAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Client lié aux cookies de la requête : permet à la route serveur de retrouver
 * la session Supabase Auth du pilote (mode « auth ») pour la vérifier.
 */
export async function supabaseSessionServeur(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !cleAnon) return null

  const stockCookies = await cookies()

  return createServerClient(url, cleAnon, {
    cookies: {
      getAll() {
        return stockCookies.getAll()
      },
      setAll(cookiesAEcrire) {
        try {
          for (const { name, value, options } of cookiesAEcrire) {
            stockCookies.set(name, value, options)
          }
        } catch {
          // Écriture de cookies impossible depuis un Server Component : sans effet ici,
          // le rafraîchissement de session est assuré par le middleware.
        }
      },
    },
  })
}
