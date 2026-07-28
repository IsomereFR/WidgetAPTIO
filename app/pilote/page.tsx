import { modeAccesPilote } from '@/lib/acces-pilote'
import { supabaseLectureServeur } from '@/lib/supabase-serveur'
import { ETAT_PAR_DEFAUT, normaliserEtat, type EtatChaine } from '@/lib/types'
import FormulairePilote from './FormulairePilote'

/**
 * Lien PILOTE — édition, protégé. URL « /pilote ».
 *
 * Le mode d'accès est résolu ici, côté serveur, puis transmis au formulaire.
 * ACCES_PILOTE n'a donc pas besoin d'être exposé au navigateur.
 */

export const dynamic = 'force-dynamic'

export default async function PagePilote() {
  const mode = modeAccesPilote()

  // Pré-remplissage du formulaire avec l'état courant.
  let etatInitial: EtatChaine = ETAT_PAR_DEFAUT
  const supabase = supabaseLectureServeur()
  if (supabase) {
    const { data } = await supabase.from('etat_chaine').select('*').eq('id', 1).maybeSingle()
    if (data) etatInitial = normaliserEtat(data)
  }

  return <FormulairePilote mode={mode} etatInitial={etatInitial} />
}
