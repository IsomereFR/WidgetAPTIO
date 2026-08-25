import type { CSSProperties } from 'react'

import type { AnalyseIndisponible } from '@/lib/types'

/**
 * Blocs d'affichage de l'état, partagés par la page de lecture et par l'aperçu
 * du formulaire pilote.
 *
 * L'extraction n'est pas cosmétique : l'aperçu ne vaut que s'il montre
 * EXACTEMENT ce que verront les services. Deux rendus séparés auraient
 * divergé au premier ajustement, et un aperçu qui ment est pire qu'aucun aperçu.
 */

export type PresentationEtat = {
  libelle: string
  descriptif: string
  couleur: string
  halo: string
}

/**
 * État affiché tant qu'aucune donnée n'a pu être lue. Neutre, jamais vert :
 * une base injoignable ne doit pas se lire comme « tout va bien ».
 */
export const PRESENTATION_INDISPONIBLE: PresentationEtat = {
  libelle: 'État indisponible',
  descriptif:
    "Le service d'affichage est momentanément injoignable. Cette page ne reflète pas l'état réel de la chaîne : renseignez-vous auprès du poste pilote.",
  couleur: '#98a0a8',
  halo: 'rgba(152,160,168,.16)',
}

export function CarteStatut({
  presentation,
  signaleChangement = false,
}: {
  presentation: PresentationEtat
  /** Met brièvement la carte en évidence à l'arrivée d'un nouvel état. */
  signaleChangement?: boolean
}) {
  return (
    <section
      className={`hero${signaleChangement ? ' vient-de-changer' : ''}`}
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
  )
}

export function CarteAnalyses({
  etatDisponible,
  toutesDisponibles,
  analyses,
}: {
  etatDisponible: boolean
  toutesDisponibles: boolean
  analyses: AnalyseIndisponible[]
}) {
  // Le compte figure dans le titre : depuis le fond d'un couloir, on retient
  // « 3 indisponibles » avant d'avoir lu le détail des lignes.
  const compteur =
    etatDisponible && !toutesDisponibles && analyses.length > 0 ? analyses.length : 0

  return (
    <section className="card" aria-live="polite">
      <h2>
        <span className="ic" aria-hidden="true" />
        Analyses
        {compteur > 0 ? (
          <span className="compteur-indispo">
            {compteur} indisponible{compteur > 1 ? 's' : ''}
          </span>
        ) : null}
      </h2>

      {!etatDisponible ? (
        <div className="all-ok">
          <div
            className="big-dot"
            style={{ background: '#98a0a8', boxShadow: 'none' }}
            aria-hidden="true"
          />
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
          {analyses.map((entree, index) => (
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
  )
}

export function BandeauMessage({ message }: { message: string }) {
  return (
    <div className="msg" aria-live="polite">
      <span className="ic" aria-hidden="true" />
      <div className="texte">{message}</div>
    </div>
  )
}
