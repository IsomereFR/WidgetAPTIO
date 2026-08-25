/**
 * Modèle de données du widget « État de la chaîne APTIO ».
 * Reflète la table `etat_chaine` décrite au §8 du PRD (une seule ligne, id = 1).
 */

export const TRAFICS = ['normal', 'retard', 'retard_important'] as const

export type Trafic = (typeof TRAFICS)[number]

export function estTrafic(valeur: unknown): valeur is Trafic {
  return typeof valeur === 'string' && (TRAFICS as readonly string[]).includes(valeur)
}

export type AnalyseIndisponible = {
  analyse: string
  /**
   * Reprise estimée. Champ texte libre volontairement, et non un sélecteur
   * de date : sur le terrain la réponse est tantôt une heure (« vers 14h »),
   * tantôt une date (« demain matin »), tantôt une incertitude assumée
   * (« en cours d'évaluation »). Un sélecteur de date forcerait à inventer
   * une précision qu'on n'a pas.
   */
  reprise: string
  commentaire: string
}

export type EtatChaine = {
  trafic: Trafic
  analyses_toutes_disponibles: boolean
  analyses_indisponibles: AnalyseIndisponible[]
  message: string
  maj_le: string
  maj_par: string
}

/**
 * Présentation des trois niveaux de trafic (§4.1 et §7 du PRD).
 * Libellés, descriptifs, couleurs et halos repris de `maquette_widget_APTIO.html`.
 * La couleur ne porte jamais l'information seule : elle accompagne toujours le libellé.
 */
export const PRESENTATION_TRAFIC: Record<
  Trafic,
  { libelle: string; descriptif: string; couleur: string; halo: string }
> = {
  normal: {
    libelle: 'Trafic normal',
    descriptif: 'Délais de rendu des résultats habituels.',
    couleur: '#6F9080',
    halo: 'rgba(111,144,128,.14)',
  },
  retard: {
    libelle: 'Retard',
    descriptif: 'Ralentissement sur la chaîne, délais de rendu allongés.',
    couleur: '#D7A24A',
    halo: 'rgba(215,162,74,.16)',
  },
  retard_important: {
    libelle: 'Retard important',
    descriptif: 'Perturbation forte de la chaîne, délais de rendu fortement impactés.',
    couleur: '#C0623F',
    halo: 'rgba(192,98,63,.15)',
  },
}

/**
 * Valeur de repli utilisée tant qu'aucun état n'a été chargé.
 * Aucune valeur métier inventée : champs texte vides.
 */
export const ETAT_PAR_DEFAUT: EtatChaine = {
  trafic: 'normal',
  analyses_toutes_disponibles: true,
  analyses_indisponibles: [],
  message: '',
  maj_le: '',
  maj_par: '',
}

/**
 * Normalise une ligne brute venue de Supabase (ou d'un événement Realtime)
 * vers la forme attendue par l'interface, sans jamais lever d'exception.
 */
export function normaliserEtat(ligne: unknown): EtatChaine {
  if (typeof ligne !== 'object' || ligne === null) return ETAT_PAR_DEFAUT

  const brut = ligne as Record<string, unknown>

  let analyses: AnalyseIndisponible[] = []
  const listeBrute = brut.analyses_indisponibles
  if (Array.isArray(listeBrute)) {
    analyses = listeBrute
      .filter((entree): entree is Record<string, unknown> => typeof entree === 'object' && entree !== null)
      .map((entree) => ({
        analyse: typeof entree.analyse === 'string' ? entree.analyse : '',
        // `reprise` est arrivée après la mise en service : les lignes déjà
        // publiées ne l'ont pas, on retombe sur une chaîne vide sans casser.
        reprise: typeof entree.reprise === 'string' ? entree.reprise : '',
        commentaire: typeof entree.commentaire === 'string' ? entree.commentaire : '',
      }))
  }

  return {
    trafic: estTrafic(brut.trafic) ? brut.trafic : ETAT_PAR_DEFAUT.trafic,
    analyses_toutes_disponibles:
      typeof brut.analyses_toutes_disponibles === 'boolean'
        ? brut.analyses_toutes_disponibles
        : ETAT_PAR_DEFAUT.analyses_toutes_disponibles,
    analyses_indisponibles: analyses,
    message: typeof brut.message === 'string' ? brut.message : '',
    maj_le: typeof brut.maj_le === 'string' ? brut.maj_le : '',
    maj_par: typeof brut.maj_par === 'string' ? brut.maj_par : '',
  }
}

/**
 * Favicon teintée de la couleur d'un état, sous forme de data-URI.
 *
 * Le widget vit dans un onglet laissé ouvert en permanence, souvent en
 * arrière-plan : une pastille colorée dans la barre d'onglets signale un
 * changement sans qu'il faille revenir sur la page.
 */
export function faviconPour(couleur: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${couleur}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
