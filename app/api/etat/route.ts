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

  // ── 4. Écriture (clé service role) ───────────────────────────────────────
  const admin = supabaseAdmin()
  if (!admin) {
    return NextResponse.json(
      { erreur: 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY manquante).' },
      { status: 500 },
    )
  }

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
