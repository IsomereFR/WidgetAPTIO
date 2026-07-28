# Logo BIOXA

`logo-bioxa.png` est une **reconstruction**, pas le fichier officiel. À remplacer
dès que possible — voir la marche à suivre plus bas.

## D'où il vient

Le seul exemplaire du logo dont disposait le développement était celui embarqué
en base64 dans `maquette_widget_APTIO.html` : un JPEG sur **fond noir opaque**,
avec une marge blanche parasite à droite et en bas.

Posé tel quel sur la réserve blanche de l'en-tête, il apparaissait comme un
rectangle sombre. Il a donc été détouré par calcul : le JPEG étant un composite
sur noir, chaque pixel vaut `encre × opacité`, ce qui permet de retrouver
l'opacité et de reconstituer un PNG à fond transparent.

## Ce que vaut cette reconstruction

**Correct** : formes, proportions, mention « LABORATOIRE » lisible, fond
réellement transparent — donc conforme au « logo détouré » demandé au §7 du PRD,
et posable aussi bien sur blanc que sur crème.

**Approximatif** : les teintes sont légèrement plus claires que l'original, et
les contours portent les artefacts de compression du JPEG source. À 44 px de
haut, l'écart est peu perceptible ; sur un tirage ou un agrandissement, il l'est.

## Comment mettre le vrai fichier

Les images collées dans une conversation n'atteignent pas le dépôt. Le chemin
fiable passe par GitHub :

1. Ouvrir le dépôt sur github.com, dossier `public/`.
2. **Add file → Upload files**, déposer le logo officiel.
3. Le nommer **`logo-bioxa.png`** pour remplacer celui-ci — aucune modification
   de code n'est alors nécessaire.
4. Commit.

Format conseillé : **PNG à fond transparent**. Si vous ne disposez que d'une
version à fond blanc, elle conviendra aussi : la réserve de l'en-tête est
blanche. Dans ce cas seul le rendu sur crème serait imparfait, ce qui n'arrive
nulle part dans l'application actuelle.

Si le fichier porte une autre extension, ajuster l'attribut `src` dans
`app/composants/Entete.tsx`.
