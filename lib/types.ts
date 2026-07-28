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
 * La couleur ne porte jamais l'information seule : elle accompagne toujours le libellé.
 */
export const PRESENTATION_TRAFIC: Record<
  Trafic,
  { libelle: string; descriptif: string; couleur: string }
> = {
  normal: {
    libelle: 'Trafic normal',
    descriptif: 'Chaîne nominale, délais habituels.',
    couleur: '#6F9080',
  },
  retard: {
    libelle: 'Retard',
    descriptif: 'Ralentissement, délais allongés.',
    couleur: '#D7A24A',
  },
  retard_important: {
    libelle: 'Retard important',
    descriptif: 'Perturbation forte, délais fortement impactés.',
    couleur: '#C0623F',
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
