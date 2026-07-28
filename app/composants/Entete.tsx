import type { ReactNode } from 'react'

/**
 * En-tête commun : logo BIOXA sur réserve blanche + titre (§7 du PRD).
 * Le logo est servi depuis /public ; il n'est pas redessiné en code.
 */
export default function Entete({
  sousTitre,
  actionDroite,
}: {
  sousTitre?: string
  actionDroite?: ReactNode
}) {
  return (
    <header className="entete">
      <div className="contenu entete-interieur">
        <span className="reserve-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-bioxa.svg" alt="BIOXA" />
        </span>
        <div>
          <h1 className="entete-titre">État de la chaîne APTIO</h1>
          {sousTitre ? <p className="entete-sous-titre">{sousTitre}</p> : null}
        </div>
        {actionDroite}
      </div>
    </header>
  )
}
