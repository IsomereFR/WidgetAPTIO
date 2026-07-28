import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Rafraîchit la session Supabase Auth (mode ACCES_PILOTE=auth) pour que le pilote
 * ne soit pas déconnecté en cours d'utilisation, et pour que la route d'écriture
 * voie toujours une session valide.
 *
 * Ne s'applique qu'à /pilote et /api/etat : la page de lecture n'a pas de session.
 */
export async function middleware(requete: NextRequest) {
  const reponse = NextResponse.next({ request: requete })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !cleAnon) return reponse

  const supabase = createServerClient(url, cleAnon, {
    cookies: {
      getAll() {
        return requete.cookies.getAll()
      },
      setAll(cookiesAEcrire) {
        for (const { name, value, options } of cookiesAEcrire) {
          reponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // Cet appel déclenche le renouvellement du jeton s'il est proche de l'expiration.
  await supabase.auth.getUser()

  return reponse
}

export const config = {
  matcher: ['/pilote', '/api/etat'],
}
