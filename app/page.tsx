import { supabaseLectureServeur } from '@/lib/supabase-serveur'
import { ETAT_PAR_DEFAUT, normaliserEtat, type EtatChaine } from '@/lib/types'
import AffichageEtat from './AffichageEtat'

/** Lien LECTURE — public interne, lecture seule, temps réel. URL « / ». */

// L'état doit être frais à chaque requête : pas de mise en cache statique.
export const dynamic = 'force-dynamic'

export default async function PageLecture() {
  const supabase = supabaseLectureServeur()

  let etatInitial: EtatChaine = ETAT_PAR_DEFAUT
  let configurationManquante = false
  // Tant qu'aucune ligne n'a été lue, on ne prétend PAS que le trafic est normal :
  // afficher du vert pendant une panne de la base serait un contresens dangereux.
  let etatDisponible = false

  if (!supabase) {
    configurationManquante = true
  } else {
    const { data } = await supabase.from('etat_chaine').select('*').eq('id', 1).maybeSingle()
    if (data) {
      etatInitial = normaliserEtat(data)
      etatDisponible = true
    }
  }

  return (
    <AffichageEtat
      etatInitial={etatInitial}
      etatDisponibleInitial={etatDisponible}
      configurationManquante={configurationManquante}
    />
  )
}
