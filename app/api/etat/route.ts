import { NextResponse } from 'next/server'

import { verifierAccesPilote } from '@/lib/acces-pilote'
import { supabaseAdmin } from '@/lib/supabase-serveur'
import { estTrafic, type AnalyseIndisponible } from '@/lib/types'

/**
 * Route d'écriture — UNIQUE chemin par lequel l'état peut être modifié (§6 du PRD).
 *
 * Elle s'exécute côté serveur, vérifie l'accès pilote (session Auth ou PIN selon
 * ACCES_PILOTE), valide les champs, puis écrit avec la clé service role.
 * La clé service role n'atteint jamais le navigateur.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Bornes de saisie : évitent qu'un envoi malformé ou volumineux n'atteigne la base.
const MAX_ANALYSES = 40
const MAX_LONGUEUR_ANALYSE = 200
const MAX_LONGUEUR_REPRISE = 120
const MAX_LONGUEUR_COMMENTAIRE = 1000
const MAX_LONGUEUR_MESSAGE = 600

function texte(valeur: unknown, maximum: number): string {
  if (typeof valeur !== 'string') return ''
  return valeur.trim().slice(0, maximum)
}

/** Égalité de deux horodatages à la milliseconde, quelle que soit leur graphie. */
function memeInstant(a: string, b: string): boolean {
  const instantA = new Date(a).getTime()
  const instantB = new Date(b).getTime()
  if (Number.isNaN(instantA) || Number.isNaN(instantB)) return false
  return instantA === instantB
}

export async function POST(requete: Request) {
  // ── 1. Corps de requête ──────────────────────────────────────────────────
  let corps: unknown
  try {
    corps = await requete.json()
  } catch {
    return NextResponse.json({ erreur: 'Corps de requête illisible.' }, { status: 400 })
  }

  if (typeof corps !== 'object' || corps === null) {
    return NextResponse.json({ erreur: 'Corps de requête invalide.' }, { status: 400 })
  }
  const donnees = corps as Record<string, unknown>

  // ── 2. Contrôle d'accès pilote ───────────────────────────────────────────
  const pin = requete.headers.get('x-pilote-pin')
  const auteurSaisi = texte(donnees.maj_par, 120)

  const acces = await verifierAccesPilote(pin, auteurSaisi)
  if (!acces.autorise) {
    return NextResponse.json({ erreur: acces.motif }, { status: 401 })
  }

  // ── 3. Validation des champs ─────────────────────────────────────────────
  const trafic = donnees.trafic
  if (!estTrafic(trafic)) {
    return NextResponse.json(
      { erreur: "Valeur de trafic invalide (attendu : normal, retard ou retard_important)." },
      { status: 400 },
    )
  }

  if (typeof donnees.analyses_toutes_disponibles !== 'boolean') {
    return NextResponse.json(
      { erreur: 'Le champ analyses_toutes_disponibles doit être un booléen.' },
      { status: 400 },
    )
  }
  const toutesDisponibles = donnees.analyses_toutes_disponibles

  let analyses: AnalyseIndisponible[] = []
  if (!toutesDisponibles) {
    const brut = donnees.analyses_indisponibles
    if (!Array.isArray(brut)) {
      return NextResponse.json(
        { erreur: 'Le champ analyses_indisponibles doit être une liste.' },
        { status: 400 },
      )
    }
    if (brut.length > MAX_ANALYSES) {
      return NextResponse.json(
        { erreur: `Liste trop longue (maximum ${MAX_ANALYSES} analyses).` },
        { status: 400 },
      )
    }

    analyses = brut
      .filter((entree): entree is Record<string, unknown> => typeof entree === 'object' && entree !== null)
      .map((entree) => ({
        analyse: texte(entree.analyse, MAX_LONGUEUR_ANALYSE),
        reprise: texte(entree.reprise, MAX_LONGUEUR_REPRISE),
        commentaire: texte(entree.commentaire, MAX_LONGUEUR_COMMENTAIRE),
      }))
      // Une ligne entièrement vide n'a pas de sens à l'affichage : on l'écarte.
      .filter(
        (entree) => entree.analyse !== '' || entree.reprise !== '' || entree.commentaire !== '',
      )

    if (analyses.length === 0) {
      return NextResponse.json(
        {
          erreur:
            "Mode « certaines analyses indisponibles » : renseignez au moins une analyse, ou repassez sur « toutes disponibles ».",
        },
        { status: 400 },
      )
    }
  }
  // Si toutes les analyses sont disponibles, la liste est forcée à vide
  // (critère d'acceptation §12 : le retour « toutes disponibles » vide la liste).

  const message = texte(donnees.message, MAX_LONGUEUR_MESSAGE)

  // ── 4. Client d'écriture (clé service role) ──────────────────────────────
  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json(
      { erreur: 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY manquante).' },
      { status: 500 },
    )
  }

  // ── 5. Garde-fou de concurrence ──────────────────────────────────────────
  // Deux postes peuvent tenir la chaîne en même temps. Sans ce contrôle, le
  // second à publier écrase silencieusement le premier — y compris s'il avait
  // ouvert le formulaire une heure plus tôt et n'a jamais vu son annonce.
  //
  // Le client renvoie l'horodatage de l'état sur lequel il a travaillé. S'il ne
  // correspond plus à celui en base, on refuse (409) et on rend l'état courant
  // pour que le pilote arbitre en connaissance de cause.
  //
  // Champ facultatif : une requête qui ne le fournit pas (script, appel direct)
  // conserve l'ancien comportement.
  const majLeConnu = texte(donnees.maj_le_connu, 64)
  if (majLeConnu) {
    const { data: courant } = await admin
      .from('etat_chaine')
      .select('maj_le, maj_par')
      .eq('id', 1)
      .maybeSingle()

    // Comparaison sur l'instant, jamais sur la chaîne : la base rend
    // « 2026-08-25T09:12:33.123456+00:00 » là où notre propre réponse rend
    // « 2026-08-25T09:12:33.123Z ». Deux écritures du même instant, deux
    // graphies — un test d'égalité textuelle signalerait un faux conflit.
    if (courant?.maj_le && !memeInstant(courant.maj_le, majLeConnu)) {
      return NextResponse.json(
        {
          erreur:
            "Un autre poste a publié un état entre-temps. Rechargez la page pour repartir de l'état courant, puis republiez.",
          conflit: { maj_le: courant.maj_le, maj_par: courant.maj_par ?? '' },
        },
        { status: 409 },
      )
    }
  }

  // ── 6. Écriture ──────────────────────────────────────────────────────────
  // L'horodatage est posé par le serveur : l'heure du poste client n'est jamais utilisée.
  const majLe = new Date().toISOString()

  const { error } = await admin.from('etat_chaine').upsert(
    {
      id: 1,
      trafic,
      analyses_toutes_disponibles: toutesDisponibles,
      analyses_indisponibles: analyses,
      message,
      maj_le: majLe,
      maj_par: acces.majPar,
    },
    { onConflict: 'id' },
  )

  if (error) {
    return NextResponse.json(
      { erreur: `Écriture refusée par la base : ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    etat: {
      trafic,
      analyses_toutes_disponibles: toutesDisponibles,
      analyses_indisponibles: analyses,
      message,
      maj_le: majLe,
      maj_par: acces.majPar,
    },
  })
}
