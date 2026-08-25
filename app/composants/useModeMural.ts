'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Mode « mural » : la page est projetée sur un écran de couloir, en continu.
 *
 * Trois effets, indissociables — un plein écran dont la veille s'enclenche au
 * bout de dix minutes ne sert à rien :
 *   1. plein écran natif, pour supprimer barre d'adresse et onglets ;
 *   2. maintien de l'écran allumé (Wake Lock) ;
 *   3. classe CSS `mural` sur <html>, qui agrandit les corps de texte et
 *      masque les commandes destinées aux personnes, pas aux passants.
 *
 * Chaque brique dégrade proprement : le Wake Lock exige un contexte sécurisé
 * (HTTPS ou localhost) et sera indisponible sur une IP en HTTP nu — le mode
 * reste alors utilisable, l'écran s'éteindra simplement selon la mise en veille
 * du poste. Ce point est signalé dans docs/HEBERGEMENT-LOCAL.md.
 */

type SentinelleVeille = { release: () => Promise<void> } | null

export function useModeMural() {
  const [actif, setActif] = useState(false)
  const [disponible, setDisponible] = useState(false)

  // Le plein écran n'existe pas au rendu serveur : on n'affiche le bouton
  // qu'une fois certain que le navigateur le prend en charge.
  useEffect(() => {
    setDisponible(typeof document !== 'undefined' && !!document.documentElement.requestFullscreen)
  }, [])

  // Sortir du plein écran par la touche Échap doit aussi sortir du mode mural,
  // sinon la page reste agrandie et amputée de ses commandes.
  useEffect(() => {
    const surChangement = () => {
      if (!document.fullscreenElement) setActif(false)
    }
    document.addEventListener('fullscreenchange', surChangement)
    return () => document.removeEventListener('fullscreenchange', surChangement)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('mural', actif)
    return () => document.documentElement.classList.remove('mural')
  }, [actif])

  // Maintien de l'écran allumé, réacquis après chaque retour d'onglet :
  // le verrou est relâché par le navigateur dès que la page passe en arrière-plan.
  useEffect(() => {
    if (!actif) return

    const api = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<SentinelleVeille> } })
      .wakeLock
    if (!api) return

    let sentinelle: SentinelleVeille = null
    let annule = false

    const acquerir = async () => {
      try {
        const obtenue = await api.request('screen')
        if (annule) {
          void obtenue?.release()
          return
        }
        sentinelle = obtenue
      } catch {
        // Contexte non sécurisé ou refus du navigateur : sans conséquence ici.
      }
    }

    const surVisibilite = () => {
      if (document.visibilityState === 'visible') void acquerir()
    }

    void acquerir()
    document.addEventListener('visibilitychange', surVisibilite)

    return () => {
      annule = true
      document.removeEventListener('visibilitychange', surVisibilite)
      void sentinelle?.release()
    }
  }, [actif])

  const basculer = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
      setActif(false)
      return
    }
    try {
      await document.documentElement.requestFullscreen()
      setActif(true)
    } catch {
      // Plein écran refusé (permission, navigateur) : on applique tout de même
      // l'agrandissement, qui est l'essentiel du bénéfice.
      setActif(true)
    }
  }, [])

  return { actif, disponible, basculer }
}
