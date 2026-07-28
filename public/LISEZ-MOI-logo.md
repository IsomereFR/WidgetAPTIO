# Logo BIOXA

`logo-bioxa.jpg` est le logo officiel, **extrait tel quel** de la maquette de
référence `maquette_widget_APTIO.html` (il y était embarqué en base64). Il n'a
pas été redessiné ni retouché.

- Format : JPEG, 336 × 504 px, **fond noir opaque** (le JPEG ne gère pas la
  transparence).
- Rendu : hauteur 44 px, posé sur la réserve blanche de l'en-tête, exactement
  comme dans la maquette.

## Point à arbitrer

Le §7 du PRD demande un « logo détouré sur réserve claire ». L'asset présent
dans la maquette a un fond noir : sur la réserve blanche, il apparaît donc comme
un petit rectangle sombre. C'est le comportement de la maquette, reproduit à
l'identique.

Si vous souhaitez un rendu réellement détouré, déposez une version PNG à fond
transparent sous le nom `logo-bioxa.png` et changez l'attribut `src` dans
`app/composants/Entete.tsx`.
