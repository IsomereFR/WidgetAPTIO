'use client'

import { useEffect, useState, type CSSProperties } from 'react'

import { formaterHorodatage } from '@/lib/format'
import { supabaseNavigateur } from '@/lib/supabase-navigateur'
import { normaliserEtat, PRESENTATION_TRAFIC, type EtatChaine } from '@/lib/types'
import Entete from './composants/Entete'
import { TEXTE_GOUVERNANCE } from './composants/NoteGouvernance'

/**
 * Page de lecture, temps réel (§4.4 du PRD).
 * Structure et styles repris de `maquette_widget_APTIO.html`.
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

  // Une liste vide vaut « toutes disponibles » : on n'affiche jamais un bloc
  // « indisponibles » sans aucune ligne.
  const toutesDisponibles =
    etat.analyses_toutes_disponibles || etat.analyses_indisponibles.length === 0

  return (
    <div className="wrap">
      <Entete
        indicateur={
          <span
            className="live"
            data-actif={enDirect}
            title={enDirect ? 'Mise à jour automatique active' : 'Connexion au flux temps réel…'}
          >
            <span className="dotpulse" aria-hidden="true" />
            {enDirect ? 'Actualisation auto' : 'Connexion…'}
          </span>
        }
      />

      {configurationManquante ? (
        <div className="encart encart-erreur" style={{ marginBottom: 20 }}>
          <span className="ic" aria-hidden="true" />
          <span>
            Configuration Supabase absente. Renseignez NEXT_PUBLIC_SUPABASE_URL et
            NEXT_PUBLIC_SUPABASE_ANON_KEY, puis rechargez la page.
          </span>
        </div>
      ) : null}

      {/* ── Carte statut ── */}
      <section
        className="hero"
        aria-live="polite"
        style={
          {
            '--state-color': presentation.couleur,
            '--state-halo': presentation.halo,
          } as CSSProperties
        }
      >
        <div className="lbl">Trafic de la chaîne</div>
        <div className="status-line">
          <div className="status-dot" aria-hidden="true" />
          <div className="status-text">
            <div className="state">{presentation.libelle}</div>
            <div className="desc">{presentation.descriptif}</div>
          </div>
        </div>
      </section>

      {/* ── Carte analyses ── */}
      <section className="card" aria-live="polite">
        <h2>
          <span className="ic" aria-hidden="true" />
          Analyses
        </h2>

        {toutesDisponibles ? (
          <div className="all-ok">
            <div className="big-dot" aria-hidden="true" />
            <div className="txt">
              <strong>Toutes les analyses disponibles</strong>
              <span>Aucune indisponibilité signalée sur la chaîne.</span>
            </div>
          </div>
        ) : (
          <ul className="indispo-list">
            {etat.analyses_indisponibles.map((entree, index) => (
              <li className="indispo" key={`${entree.analyse}-${index}`}>
                <div className="name">
                  <span className="pin" aria-hidden="true" />
                  {entree.analyse || 'Analyse non nommée'}
                </div>
                {entree.commentaire ? <div className="note">{entree.commentaire}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Message libre, seulement s'il est renseigné ── */}
      {etat.message.trim() ? (
        <div className="msg" aria-live="polite">
          <span className="ic" aria-hidden="true" />
          <div className="texte">{etat.message}</div>
        </div>
      ) : null}

      {/* ── Pied ── */}
      <footer className="foot">
        {horodatage ? (
          <div className="maj">
            Dernière mise à jour : <strong>{horodatage}</strong>
            {etat.maj_par ? ` · ${etat.maj_par}` : ''}
          </div>
        ) : (
          <div className="maj">Aucune mise à jour enregistrée pour le moment.</div>
        )}
        <div className="note">{TEXTE_GOUVERNANCE}</div>
      </footer>
    </div>
  )
}
