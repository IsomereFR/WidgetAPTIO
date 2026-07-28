'use client'

import Link from 'next/link'
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
/**
 * État affiché tant qu'aucune donnée n'a pu être lue. Neutre, jamais vert :
 * une base injoignable ne doit pas se lire comme « tout va bien ».
 */
/**
 * État de la liaison temps réel. Trois valeurs distinctes, parce que
 * « je me connecte » et « je n'y arrive pas » ne doivent pas se ressembler :
 * un « Connexion… » éternel laisse croire que la page est à jour.
 */
type EtatLiaison = 'connexion' | 'direct' | 'repli'

const PRESENTATION_LIAISON: Record<EtatLiaison, { libelle: string; titre: string }> = {
  connexion: {
    libelle: 'Connexion…',
    titre: 'Établissement de la liaison temps réel',
  },
  direct: {
    libelle: 'Actualisation auto',
    titre: 'Liaison temps réel active : la page se met à jour instantanément',
  },
  repli: {
    libelle: 'Actualisation différée',
    titre:
      "Liaison temps réel indisponible. La page se rafraîchit toutes les 15 secondes : un changement peut mettre jusqu'à 15 s à apparaître.",
  },
}

const PRESENTATION_INDISPONIBLE = {
  libelle: 'État indisponible',
  descriptif:
    "Le service d'affichage est momentanément injoignable. Cette page ne reflète pas l'état réel de la chaîne : renseignez-vous auprès du poste pilote.",
  couleur: '#98a0a8',
  halo: 'rgba(152,160,168,.16)',
}

export default function AffichageEtat({
  etatInitial,
  etatDisponibleInitial,
  configurationManquante,
}: {
  etatInitial: EtatChaine
  etatDisponibleInitial: boolean
  configurationManquante: boolean
}) {
  const [etat, setEtat] = useState<EtatChaine>(etatInitial)
  const [etatDisponible, setEtatDisponible] = useState(etatDisponibleInitial)
  const [liaison, setLiaison] = useState<EtatLiaison>('connexion')

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
      if (!annule && !error && data) {
        setEtat(normaliserEtat(data))
        setEtatDisponible(true)
      }
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
            setEtatDisponible(true)
          } else {
            void recharger()
          }
        },
      )
      .subscribe((statut, erreur) => {
        if (annule) return

        // Trace de diagnostic : sans elle, un canal qui n'aboutit pas est
        // indiscernable d'un canal qui met simplement du temps à s'établir.
        console.info('[APTIO] canal temps réel :', statut, erreur ?? '')

        if (statut === 'SUBSCRIBED') {
          setLiaison('direct')
          // À la (re)connexion, on resynchronise : cela rattrape tout changement
          // survenu pendant une coupure réseau.
          void recharger()
        } else if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT' || statut === 'CLOSED') {
          setLiaison('repli')
        }
      })

    // Un écran mural peut rester ouvert des heures : on resynchronise aussi
    // quand l'onglet redevient visible ou que le réseau revient.
    const surReveil = () => {
      if (document.visibilityState === 'visible') void recharger()
    }
    document.addEventListener('visibilitychange', surReveil)
    window.addEventListener('online', surReveil)

    // Filet de sécurité : si le canal n'a pas abouti au bout de 8 secondes,
    // on cesse d'afficher « Connexion… » indéfiniment.
    const delaiBascule = window.setTimeout(() => {
      if (!annule) setLiaison((precedent) => (precedent === 'connexion' ? 'repli' : precedent))
    }, 8000)

    return () => {
      annule = true
      window.clearTimeout(delaiBascule)
      document.removeEventListener('visibilitychange', surReveil)
      window.removeEventListener('online', surReveil)
      void supabase.removeChannel(canal)
    }
  }, [])

  // Repli : tant que le temps réel n'est pas établi, on relit périodiquement.
  // Le PRD privilégie l'abonnement au polling, mais une page qui ne se met
  // jamais à jour serait pire que tout — ce filet ne tourne QUE hors direct.
  useEffect(() => {
    if (liaison === 'direct') return
    const supabase = supabaseNavigateur()
    if (!supabase) return

    let annule = false
    const intervalle = window.setInterval(async () => {
      const { data, error } = await supabase
        .from('etat_chaine')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (!annule && !error && data) {
        setEtat(normaliserEtat(data))
        setEtatDisponible(true)
      }
    }, 15000)

    return () => {
      annule = true
      window.clearInterval(intervalle)
    }
  }, [liaison])

  const presentation = etatDisponible
    ? PRESENTATION_TRAFIC[etat.trafic]
    : PRESENTATION_INDISPONIBLE
  const horodatage = formaterHorodatage(etat.maj_le)

  // Une liste vide vaut « toutes disponibles » : on n'affiche jamais un bloc
  // « indisponibles » sans aucune ligne.
  const toutesDisponibles =
    etat.analyses_toutes_disponibles || etat.analyses_indisponibles.length === 0

  return (
    <div className="wrap">
      <Entete
        indicateur={
          <div className="entete-actions">
            <span
              className="live"
              data-liaison={liaison}
              title={PRESENTATION_LIAISON[liaison].titre}
            >
              <span className="dotpulse" aria-hidden="true" />
              {PRESENTATION_LIAISON[liaison].libelle}
            </span>
            <Link href="/pilote" className="lien-pilote">
              Espace pilote
            </Link>
          </div>
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

        {!etatDisponible ? (
          <div className="all-ok">
            <div className="big-dot" style={{ background: '#98a0a8', boxShadow: 'none' }} aria-hidden="true" />
            <div className="txt">
              <strong>Information non disponible</strong>
              <span>L&apos;état des analyses n&apos;a pas pu être chargé.</span>
            </div>
          </div>
        ) : toutesDisponibles ? (
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
                {entree.reprise ? (
                  <div className="reprise">
                    <span className="reprise-etiquette">Reprise estimée</span>
                    <span className="reprise-valeur">{entree.reprise}</span>
                  </div>
                ) : null}
                {entree.commentaire ? <div className="note">{entree.commentaire}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Message libre, seulement s'il est renseigné ── */}
      {etatDisponible && etat.message.trim() ? (
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
