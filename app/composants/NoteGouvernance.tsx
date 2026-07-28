/**
 * Rappel de gouvernance imposé au §10 du PRD : le widget est un outil de
 * communication interne et ne se substitue à aucun enregistrement qualité.
 */
export const TEXTE_GOUVERNANCE =
  "Cet affichage ne remplace pas l'ouverture des enregistrements qualité " +
  '(FNC Kalilab, réactovigilance) prévus en cas de panne.'

export default function NoteGouvernance() {
  return <p className="gouvernance">{TEXTE_GOUVERNANCE}</p>
}
