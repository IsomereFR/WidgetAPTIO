import type { ReactNode } from 'react'

/**
 * Libellé de site. Codé en dur jusqu'ici, il devient une variable
 * d'environnement : le même code peut ainsi être déployé sur un second site
 * sans recompiler une variante, et l'hébergeur n'a pas à toucher aux sources.
 *
 * Variable NEXT_PUBLIC_ : sa valeur est figée au moment du BUILD, pas au
 * démarrage du conteneur (cf. docs/HEBERGEMENT-LOCAL.md).
 */
export const LIBELLE_SITE = process.env.NEXT_PUBLIC_SITE_LIBELLE?.trim() || 'Site : BEZANNES'

/**
 * En-tête commun, repris de `maquette_widget_APTIO.html` : logo BIOXA sur
 * réserve blanche, titre et sous-titre à gauche, indicateur à droite.
 * Le logo est servi depuis /public ; il n'est pas redessiné en code.
 */
export default function Entete({
  sousTitre = LIBELLE_SITE,
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
