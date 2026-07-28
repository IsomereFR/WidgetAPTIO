import type { ReactNode } from 'react'

/**
 * En-tête commun, repris de `maquette_widget_APTIO.html` : logo BIOXA sur
 * réserve blanche, titre et sous-titre à gauche, indicateur à droite.
 * Le logo est servi depuis /public ; il n'est pas redessiné en code.
 */
export default function Entete({
  sousTitre = 'Plateau technique automation · information interne',
  indicateur,
}: {
  sousTitre?: string
  indicateur?: ReactNode
}) {
  return (
    <header className="top">
      <div className="brand">
        <span className="logo-reserve">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-bioxa.jpg" alt="BIOXA Laboratoire" />
        </span>
        <div className="titles">
          <h1>État de la chaîne APTIO</h1>
          <p>{sousTitre}</p>
        </div>
      </div>
      {indicateur}
    </header>
  )
}
