'use client'

import { useEffect, useState, type CSSProperties } from 'react'

import { formaterHorodatage } from '@/lib/format'
import { supabaseNavigateur } from '@/lib/supabase-navigateur'
import { normaliserEtat, PRESENTATION_TRAFIC, type EtatChaine } from '@/lib/types'
import Entete from './composants/Entete'
import NoteGouvernance from './composants/NoteGouvernance'

/**
 * Page de lecture, temps réel (§4.4 du PRD).
 *
 * L'état initial est rendu côté serveur (affichage immédiat), puis ce composant
 * s'abonne aux changements de `etat_chaine` via Supabase Realtime avec la clé anon.
 * Aucun rechargement, aucun polling.
 */
export default function AffichageEtat({
  etatInitial,
  configurationManquante,
}: {
  etatInitial: EtatChaine
  configurationManquante: boolean
}) {
  const [etat, setEtat] = useState<EtatChaine>(etatInitial)
  const [enDirect, setEnDirect] = useState(false)

  useEffect(() => {
    const supabase = supabaseNavigateur()
    if (!supabase) return

    let annule = false

    const recharger = async () => {
      const { data, error } = await supabase
        .from('etat_chaine')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (!annule && !error && data) setEtat(normaliserEtat(data))
    }

    const canal = supabase
      .channel('etat_chaine_direct')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'etat_chaine' },
        (charge) => {
          if (annule) return
          const nouvelle = charge.new
          if (nouvelle && typeof nouvelle === 'object' && 'trafic' in nouvelle) {
            setEtat(normaliserEtat(nouvelle))
          } else {
            void recharger()
          }
        },
      )
      .subscribe((statut) => {
        if (annule) return
        setEnDirect(statut === 'SUBSCRIBED')
        // À la (re)connexion, on resynchronise : cela rattrape tout changement
        // survenu pendant une coupure réseau.
        if (statut === 'SUBSCRIBED') void recharger()
      })

    // Un écran mural peut rester ouvert des heures : on resynchronise aussi
    // quand l'onglet redevient visible ou que le réseau revient.
    const surReveil = () => {
      if (document.visibilityState === 'visible') void recharger()
    }
    document.addEventListener('visibilitychange', surReveil)
    window.addEventListener('online', surReveil)

    return () => {
      annule = true
      document.removeEventListener('visibilitychange', surReveil)
      window.removeEventListener('online', surReveil)
      void supabase.removeChannel(canal)
    }
  }, [])

  const presentation = PRESENTATION_TRAFIC[etat.trafic]
  const horodatage = formaterHorodatage(etat.maj_le)

  // Une liste vide vaut « toutes disponibles » : on ne veut jamais afficher
  // un bloc « indisponibles » sans aucune ligne.
  const toutesDisponibles =
    etat.analyses_toutes_disponibles || etat.analyses_indisponibles.length === 0

  return (
    <div className="page">
      <Entete
        actionDroite={
          <span className="direct" data-actif={enDirect} title={enDirect ? 'Mise à jour automatique active' : 'Connexion au flux temps réel…'}>
            <span className="direct-point" aria-hidden="true" />
            {enDirect ? 'En direct' : 'Connexion…'}
          </span>
        }
      />

      <main className="corps">
        <div className="contenu">
          {configurationManquante ? (
            <div className="carte">
              <p className="encart encart-erreur" style={{ margin: 0 }}>
                Configuration Supabase absente. Renseignez NEXT_PUBLIC_SUPABASE_URL et
                NEXT_PUBLIC_SUPABASE_ANON_KEY, puis rechargez la page.
              </p>
            </div>
          ) : null}

          {/* ── Bloc statut, grand format ── */}
          <section className="carte" aria-live="polite">
            <h2 className="carte-intitule">État du trafic</h2>
            <div
              className="statut"
              style={{ '--couleur-statut': presentation.couleur } as CSSProperties}
            >
              <span className="pastille" aria-hidden="true" />
              <div>
                <p className="statut-libelle">{presentation.libelle}</p>
                <p className="statut-descriptif">{presentation.descriptif}</p>
              </div>
            </div>
          </section>

          {/* ── Bloc analyses ── */}
          <section className="carte" aria-live="polite">
            <h2 className="carte-intitule">
              {toutesDisponibles ? 'Analyses' : 'Analyses indisponibles'}
            </h2>
            {toutesDisponibles ? (
              <p className="analyses-toutes">
                <span className="puce-disponible" aria-hidden="true" />
                Toutes les analyses disponibles
              </p>
            ) : (
              <ul className="liste-analyses">
                {etat.analyses_indisponibles.map((entree, index) => (
                  <li className="analyse" key={`${entree.analyse}-${index}`}>
                    <p className="analyse-nom">{entree.analyse || 'Analyse non nommée'}</p>
                    {entree.commentaire ? (
                      <p className="analyse-commentaire">{entree.commentaire}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Message libre, seulement s'il est renseigné ── */}
          {etat.message.trim() ? (
            <section className="carte" aria-live="polite">
              <h2 className="carte-intitule">Message</h2>
              <p className="message">{etat.message}</p>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="pied">
        <div className="contenu">
          {horodatage ? (
            <p className="maj">
              Dernière mise à jour : {horodatage}
              {etat.maj_par ? ` · ${etat.maj_par}` : ''}
            </p>
          ) : (
            <p className="maj maj-vide">Aucune mise à jour enregistrée pour le moment.</p>
          )}
          <NoteGouvernance />
        </div>
      </footer>
    </div>
  )
}
