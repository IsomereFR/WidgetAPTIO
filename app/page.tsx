import { cache } from 'react'
import type { Metadata } from 'next'

import { supabaseLectureServeur } from '@/lib/supabase-serveur'
import {
  ETAT_PAR_DEFAUT,
  faviconPour,
  normaliserEtat,
  PRESENTATION_TRAFIC,
  type EtatChaine,
} from '@/lib/types'
import { PRESENTATION_INDISPONIBLE } from './composants/BlocEtat'
import AffichageEtat from './AffichageEtat'

/** Lien LECTURE — public interne, lecture seule, temps réel. URL « / ». */

// L'état doit être frais à chaque requête : pas de mise en cache statique.
export const dynamic = 'force-dynamic'

type Lecture = { etat: EtatChaine; disponible: boolean; configurationManquante: boolean }

/**
 * Lecture de l'état courant.
 *
 * `cache()` la mémoïse pour la durée de la requête : `generateMetadata` et le
 * composant de page l'appellent tous deux, mais la base n'est interrogée qu'une fois.
 */
const lireEtat = cache(async (): Promise<Lecture> => {
  const supabase = supabaseLectureServeur()
  if (!supabase) {
    return { etat: ETAT_PAR_DEFAUT, disponible: false, configurationManquante: true }
  }

  const { data } = await supabase.from('etat_chaine').select('*').eq('id', 1).maybeSingle()

  // Tant qu'aucune ligne n'a été lue, on ne prétend PAS que le trafic est normal :
  // afficher du vert pendant une panne de la base serait un contresens dangereux.
  if (!data) {
    return { etat: ETAT_PAR_DEFAUT, disponible: false, configurationManquante: false }
  }

  return { etat: normaliserEtat(data), disponible: true, configurationManquante: false }
})

/**
 * Titre d'onglet et favicon portant l'état courant.
 *
 * Calculés ici, côté serveur, et non depuis le composant client : le système de
 * metadata de Next reprend la main sur le <head> à l'hydratation et écraserait
 * une écriture faite au montage. Les changements reçus ensuite en temps réel
 * sont, eux, appliqués par `AffichageEtat`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { etat, disponible } = await lireEtat()
  const presentation = disponible ? PRESENTATION_TRAFIC[etat.trafic] : PRESENTATION_INDISPONIBLE

  return {
    title: `${presentation.libelle} · État de la chaîne`,
    icons: { icon: { url: faviconPour(presentation.couleur), type: 'image/svg+xml' } },
  }
}

export default async function PageLecture() {
  const { etat, disponible, configurationManquante } = await lireEtat()

  return (
    <AffichageEtat
      etatInitial={etat}
      etatDisponibleInitial={disponible}
      configurationManquante={configurationManquante}
    />
  )
}
