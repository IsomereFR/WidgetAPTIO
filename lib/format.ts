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
