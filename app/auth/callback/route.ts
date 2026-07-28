import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Retour du lien magique Supabase Auth (mode ACCES_PILOTE=auth).
 *
 * Supabase renvoie soit `?code=` (flux PKCE, utilisé par @supabase/ssr),
 * soit `?token_hash=&type=`. Les deux sont pris en charge ici. La session est
 * posée en cookies, puis le pilote est redirigé vers /pilote.
 */

export const dynamic = 'force-dynamic'

function destinationSure(brut: string | null): string {
  // On n'accepte qu'un chemin interne : évite une redirection ouverte.
  if (!brut || !brut.startsWith('/') || brut.startsWith('//')) return '/pilote'
  return brut
}

export async function GET(requete: Request) {
  const url = new URL(requete.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const destination = destinationSure(url.searchParams.get('next'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const echec = (motif: string) =>
    NextResponse.redirect(new URL(`/pilote?erreur=${motif}`, url.origin))

  if (!supabaseUrl || !cleAnon) return echec('configuration')
  if (!code && !tokenHash) return echec('lien_invalide')

  const reponse = NextResponse.redirect(new URL(destination, url.origin))
  const stockCookies = await cookies()

  const supabase = createServerClient(supabaseUrl, cleAnon, {
    cookies: {
      getAll() {
        return stockCookies.getAll()
      },
      setAll(cookiesAEcrire) {
        for (const { name, value, options } of cookiesAEcrire) {
          reponse.cookies.set(name, value, options)
        }
      },
    },
  })

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash as string,
        type: (type as 'magiclink' | 'email') || 'magiclink',
      })

  if (error) return echec('lien_expire')

  return reponse
}
