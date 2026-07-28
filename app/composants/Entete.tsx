import type { ReactNode } from 'react'

/**
 * En-tête commun, repris de `maquette_widget_APTIO.html` : logo BIOXA sur
 * réserve blanche, titre et sous-titre à gauche, indicateur à droite.
 * Le logo est servi depuis /public ; il n'est pas redessiné en code.
 */
export default function Entete({
  sousTitre = 'Site : BEZANNES',
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
          <img src="/logo-bioxa.png" alt="BIOXA Laboratoire" />
        </span>
        <div className="titles">
          <h1>État de production du plateau technique</h1>
          <p>{sousTitre}</p>
        </div>
      </div>
      {indicateur}
    </header>
  )
}
