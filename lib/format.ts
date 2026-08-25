/**
 * Formatage de l'horodatage de dernière mise à jour (§4.3 du PRD) : `JJ/MM/AAAA HH:MM`.
 *
 * Le fuseau est forcé à Europe/Paris : le rendu est ainsi identique côté serveur et
 * côté navigateur (pas de désynchronisation d'hydratation) et reste juste quel que
 * soit le fuseau de la machine qui consulte la page.
 */
const FORMATEUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formaterHorodatage(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const parties: Record<string, string> = {}
  for (const partie of FORMATEUR.formatToParts(date)) {
    parties[partie.type] = partie.value
  }

  const { day, month, year, hour, minute } = parties
  if (!day || !month || !year || !hour || !minute) return ''

  return `${day}/${month}/${year} ${hour}:${minute}`
}

/**
 * Seuil au-delà duquel un état est considéré comme « non confirmé ».
 *
 * Un écran mural affiche la dernière chose publiée, indéfiniment. Sans repère
 * d'ancienneté, un « Trafic normal » vieux de trois jours se lit exactement
 * comme un « Trafic normal » publié il y a deux minutes — alors que le premier
 * ne dit rien de l'état réel de la chaîne.
 *
 * Réglable par NEXT_PUBLIC_SEUIL_PERIME_HEURES pour coller au rythme réel de
 * publication du laboratoire (12 h par défaut : une publication par demi-journée).
 */
export const SEUIL_PERIME_HEURES = (() => {
  const brut = Number(process.env.NEXT_PUBLIC_SEUIL_PERIME_HEURES)
  return Number.isFinite(brut) && brut > 0 ? brut : 12
})()

/**
 * Ancienneté en toutes lettres : « il y a 4 min », « il y a 3 h », « hier »…
 *
 * Rendue volontairement approximative : annoncer « il y a 3 h » est plus
 * honnête que « il y a 2 h 58 min », qui suggère une précision que
 * l'information n'a pas.
 *
 * @param iso        horodatage de la dernière publication
 * @param maintenant instant de référence, injecté pour rester testable
 */
export function ancienneteRelative(iso: string, maintenant: number): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const secondes = Math.round((maintenant - date.getTime()) / 1000)

  // Horodatage dans le futur : décalage d'horloge entre serveur et poste.
  // On ne prétend pas savoir lequel a raison, on n'affiche simplement rien.
  if (secondes < -60) return ''
  if (secondes < 90) return "à l'instant"

  const minutes = Math.round(secondes / 60)
  if (minutes < 60) return `il y a ${minutes} min`

  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`

  const jours = Math.round(heures / 24)
  if (jours === 1) return 'hier'
  return `il y a ${jours} jours`
}

/**
 * Vrai lorsque la dernière publication dépasse le seuil de péremption.
 * Un horodatage absent ou illisible n'est PAS traité comme périmé : c'est un
 * autre problème, signalé ailleurs par « Aucune mise à jour enregistrée ».
 */
export function estPerime(iso: string, maintenant: number): boolean {
  if (!iso) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  return maintenant - date.getTime() > SEUIL_PERIME_HEURES * 3600 * 1000
}
