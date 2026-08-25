'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import {
  SEUIL_PERIME_HEURES,
  ancienneteRelative,
  estPerime,
  formaterHorodatage,
} from '@/lib/format'
import { supabaseNavigateur } from '@/lib/supabase-navigateur'
import { faviconPour, normaliserEtat, PRESENTATION_TRAFIC, type EtatChaine } from '@/lib/types'
import {
  BandeauMessage,
  CarteAnalyses,
  CarteStatut,
  PRESENTATION_INDISPONIBLE,
} from './composants/BlocEtat'
import Entete from './composants/Entete'
import { useModeMural } from './composants/useModeMural'
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

/** Durée de la mise en évidence qui suit l'arrivée d'un nouvel état. */
const DUREE_SIGNAL_MS = 5000

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

  /**
   * Instant de référence pour l'ancienneté. `null` au premier rendu : le
   * serveur et le navigateur ne partagent pas la même horloge, calculer
   * l'ancienneté des deux côtés produirait une divergence d'hydratation.
   * L'information n'apparaît donc qu'après montage.
   */
  const [maintenant, setMaintenant] = useState<number | null>(null)
  const [signaleChangement, setSignaleChangement] = useState(false)

  const mural = useModeMural()

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

  // Horloge de l'ancienneté. La minute est la plus petite unité affichée :
  // un rafraîchissement toutes les 30 s suffit à ne jamais montrer un écart
  // d'une minute entière.
  useEffect(() => {
    setMaintenant(Date.now())
    const intervalle = window.setInterval(() => setMaintenant(Date.now()), 30000)
    return () => window.clearInterval(intervalle)
  }, [])

  // Mise en évidence d'un état qui vient d'arriver. On compare l'horodatage
  // plutôt que l'objet : c'est le seul champ que le serveur garantit différent
  // à chaque publication, y compris quand le pilote republie le même trafic.
  const horodatagePrecedent = useRef(etatInitial.maj_le)
  useEffect(() => {
    if (etat.maj_le === horodatagePrecedent.current) return
    horodatagePrecedent.current = etat.maj_le

    setSignaleChangement(true)
    const delai = window.setTimeout(() => setSignaleChangement(false), DUREE_SIGNAL_MS)
    return () => window.clearTimeout(delai)
  }, [etat.maj_le])

  const presentation = etatDisponible
    ? PRESENTATION_TRAFIC[etat.trafic]
    : PRESENTATION_INDISPONIBLE

  /**
   * Titre d'onglet et favicon suivent l'état : l'onglet reste ouvert en
   * arrière-plan toute la journée, il devient lui-même un indicateur.
   *
   * Le titre du PREMIER rendu vient du serveur (`generateMetadata`, app/page.tsx) :
   * une écriture dans `document.title` au montage serait écrasée par le système
   * de metadata de Next au moment de l'hydratation. Cet effet ne sert donc qu'aux
   * changements reçus ensuite en temps réel, une fois l'hydratation terminée.
   */
  useEffect(() => {
    document.title = `${presentation.libelle} · État de la chaîne`

    // Le lien est rendu par le serveur (`generateMetadata`) : on le met à jour,
    // on n'en ajoute pas un second — deux `rel="icon"` et c'est le dernier du
    // document qui gagne, donc pas nécessairement le nôtre.
    const lien = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (lien) lien.href = faviconPour(presentation.couleur)
  }, [presentation.libelle, presentation.couleur])

  const horodatage = formaterHorodatage(etat.maj_le)
  const anciennete = maintenant === null ? '' : ancienneteRelative(etat.maj_le, maintenant)
  const perime = maintenant !== null && etatDisponible && estPerime(etat.maj_le, maintenant)

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
            {mural.disponible ? (
              <button
                type="button"
                className="lien-pilote bouton-mural"
                onClick={() => void mural.basculer()}
                aria-pressed={mural.actif}
                title="Plein écran, texte agrandi et écran maintenu allumé — pour un affichage de couloir"
              >
                {mural.actif ? 'Quitter le mode mural' : 'Mode mural'}
              </button>
            ) : null}
            <Link href="/pilote" className="lien-pilote lien-espace-pilote">
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

      {/* ── Alerte de péremption ──
          Publiée il y a longtemps, une information cesse d'en être une : on le
          dit, plutôt que de laisser un vert périmé passer pour un vert actuel. */}
      {perime ? (
        <div className="encart encart-consigne encart-perime" role="status">
          <span className="ic" aria-hidden="true" />
          <span>
            État non confirmé depuis plus de {SEUIL_PERIME_HEURES} h
            {anciennete ? ` (${anciennete})` : ''}. Il peut ne plus refléter la situation
            réelle : renseignez-vous auprès du poste pilote.
          </span>
        </div>
      ) : null}

      <CarteStatut presentation={presentation} signaleChangement={signaleChangement} />

      <CarteAnalyses
        etatDisponible={etatDisponible}
        toutesDisponibles={toutesDisponibles}
        analyses={etat.analyses_indisponibles}
      />

      {/* ── Message libre, seulement s'il est renseigné ── */}
      {etatDisponible && etat.message.trim() ? <BandeauMessage message={etat.message} /> : null}

      {/* ── Pied ── */}
      <footer className="foot">
        {horodatage ? (
          <div className="maj">
            Dernière mise à jour : <strong>{horodatage}</strong>
            {anciennete ? <span className="anciennete">{anciennete}</span> : null}
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
