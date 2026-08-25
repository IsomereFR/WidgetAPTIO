# Widget « État de la chaîne APTIO »

Affichage temps réel de l'état de fonctionnement de la chaîne d'automation APTIO,
mis à jour par le pilote de chaîne et consultable en lecture seule par tout le
laboratoire, via **deux liens distincts**.

Implémentation du PRD v0.2 (`PRD_Widget_Etat_Chaine_APTIO_v0.2.md`).
Pile : **Next.js (App Router) + Supabase**, déployable sur **Vercel** ou sur
**l'infrastructure interne** (Docker).

> **Reprise de l'hébergement en interne**
> - [`docs/HEBERGEMENT-LOCAL.md`](docs/HEBERGEMENT-LOCAL.md) — dossier technique
>   destiné à la DSI : architecture, dépendances réelles, installation Docker,
>   exploitation, recette de validation.
> - [`docs/REMISE-DSI.md`](docs/REMISE-DSI.md) — marche à suivre côté
>   laboratoire pour transmettre le code et les secrets.

---

## Les deux liens à diffuser

Une fois déployé, l'application expose deux URL sur le **même** domaine :

| Usage | URL | Accès |
|---|---|---|
| **Lecture** — tous les postes | `https://<votre-domaine>/` | Public interne, lecture seule, temps réel |
| **Pilote** — poste pilote | `https://<votre-domaine>/pilote` | Protégé (lien magique e-mail ou code PIN) |

`<votre-domaine>` est soit le domaine Vercel par défaut (`widget-aptio.vercel.app`),
soit un sous-domaine BIOXA si vous en branchez un (§9.3 du PRD).

> Diffusez **uniquement** le lien de lecture aux services. Le lien pilote reste
> sur le poste pilote.

---

## Ce que fait l'application

- **Page de lecture** (`/`) : bloc statut grand format (pastille couleur **et**
  libellé texte), état des analyses, message libre, horodatage et auteur de la
  dernière mise à jour, rappel de gouvernance Kalilab. Se met à jour **toute
  seule** dès que le pilote publie (Supabase Realtime, sans rechargement ni polling).
- **Page pilote** (`/pilote`) : formulaire de publication pré-rempli avec l'état
  courant — trois boutons de trafic exclusifs, bascule « toutes disponibles » /
  « certaines indisponibles » avec liste éditable, message optionnel.
- **Route serveur** (`/api/etat`) : seul chemin par lequel l'état peut être écrit.

### Fraîcheur et lisibilité de l'information

Un écran mural affiche la dernière chose publiée, indéfiniment. Plusieurs
dispositifs empêchent une information périmée de se lire comme une information
sûre :

- **Ancienneté affichée** à côté de l'horodatage (« il y a 4 min », « hier »), et
  **bandeau d'alerte** au-delà de `NEXT_PUBLIC_SEUIL_PERIME_HEURES` (12 h par
  défaut) : « État non confirmé depuis plus de 12 h ».
- **Jamais de vert par défaut** : base injoignable ⇒ « État indisponible », en gris.
- **Titre d'onglet et favicon** portent la couleur de l'état : l'onglet laissé
  ouvert en arrière-plan devient lui-même un indicateur.
- **Mise en évidence** de la carte à l'arrivée d'un nouvel état, trois pulsations.
- **Compteur** d'analyses indisponibles dans le titre de la carte.
- **Mode mural** : plein écran, corps de texte agrandis, écran maintenu allumé
  (Wake Lock — nécessite HTTPS ou `localhost`), commandes masquées.

### Garde-fous du formulaire pilote

- **Aperçu** avant publication, rendu avec les composants **de la page de
  lecture** : ce qui s'affiche dans l'aperçu est ce que verront les services.
- **Garde-fou de concurrence** : si un autre poste a publié pendant la saisie,
  la publication est refusée (`409`) plutôt que d'écraser silencieusement — le
  pilote est invité à recharger l'état courant.
- **« Modifications non publiées »** signalé dans l'en-tête, et avertissement à
  la fermeture de l'onglet : fermer en croyant avoir publié est l'erreur la plus
  coûteuse de ce formulaire.
- **Réordonnancement** des analyses (↑ / ↓) : l'ordre de la liste est l'ordre
  d'affichage pour tout le laboratoire.

---

## Sécurité — comment l'écriture est verrouillée

C'est le point structurant de l'application. Trois barrières se cumulent :

1. **Le navigateur ne peut pas écrire.** Les pages n'utilisent que la clé
   `anon`. La RLS de Supabase ne définit qu'une policy `SELECT` — aucune policy
   d'écriture n'existe. Même en appelant Supabase depuis la console du
   navigateur, une écriture est refusée par la base.
2. **L'écriture passe par le serveur.** Seule `app/api/etat/route.ts` écrit, avec
   la clé `service_role`. Cette clé n'est jamais préfixée `NEXT_PUBLIC_`, et le
   module qui la lit est marqué `server-only` : toute tentative de l'importer
   depuis un composant client fait **échouer la compilation**.
3. **La route vérifie le pilote.** Session Supabase Auth (avec liste blanche
   d'adresses) ou code PIN, selon le mode retenu. Sans preuve valable : `401`.

L'horodatage `maj_le` est posé par le serveur : l'heure du poste client n'est
jamais utilisée.

---

## Mise en place

### 1. Base Supabase

Créez un projet Supabase **en région `eu-central-1` (Francfort)** — exigence §5 du PRD.

Dans le SQL Editor, exécutez le contenu de [`supabase/schema.sql`](supabase/schema.sql).
Il crée la table `etat_chaine` (une seule ligne, `id = 1`), active la RLS avec la
seule policy de lecture, et ajoute la table à la publication Realtime.

### 2. Variables d'environnement

Copiez `.env.local.example` en `.env.local` et renseignez les valeurs (Supabase →
Project Settings → API).

| Variable | Rôle | Secrète ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique, lecture seule via RLS | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Écriture serveur | **Oui** |
| `ACCES_PILOTE` | `pin` (retenu) ou `auth` | Non |
| `PILOTE_PIN` | Mot de passe unique (mode `pin`) | **Oui** |
| `PILOTE_EMAILS` | Adresses autorisées (mode `auth`) | Non |
| `NEXT_PUBLIC_SITE_LIBELLE` | Sous-titre de l'en-tête (défaut : `Site : BEZANNES`) | Non |
| `NEXT_PUBLIC_SEUIL_PERIME_HEURES` | Seuil d'alerte de péremption (défaut : `12`) | Non |

> Le PRD nomme ces variables `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Elles portent
> ici le préfixe `NEXT_PUBLIC_` imposé par Next.js pour les valeurs que le
> navigateur doit lire — mêmes valeurs, nom conforme au framework.

> ⚠️ Les variables `NEXT_PUBLIC_` sont **figées au moment du build** : Next.js
> remplace leur nom par leur valeur dans le JavaScript envoyé au navigateur. Les
> modifier impose de **reconstruire** (`npm run build`, ou
> `docker compose up -d --build`) — un simple redémarrage n'a aucun effet.

### 3. Lancement local

```bash
npm install
npm run dev
```

Lecture sur <http://localhost:3000/>, pilote sur <http://localhost:3000/pilote>.

Autres commandes : `npm run build` (build de production), `npm start` (servir ce
build), `npm run typecheck` (vérification TypeScript).

---

## Mode d'accès pilote (§9.1 du PRD)

Le point d'arbitrage laissé ouvert par le PRD est **implémenté dans les deux
sens**. Tout le mécanisme tient dans un seul fichier, [`lib/acces-pilote.ts`](lib/acces-pilote.ts) :
basculer d'un mode à l'autre ne demande **aucune modification de code**.

### Mode `pin` — mot de passe unique · **retenu**

```
ACCES_PILOTE=pin
PILOTE_PIN=<mot de passe choisi>
```

La page `/pilote` demande le mot de passe, puis présente le formulaire de
publication. Le pilote renseigne un champ « poste ou initiales » qui alimente
`maj_par`.

**Conséquence à assumer** : l'auteur est **déclaratif**, pas vérifié. Le mot de
passe étant partagé, la seule trace de qui a publié est ce que la personne a
bien voulu taper. Si un jour vous devez répondre à « qui a annoncé cet état ? »
lors d'un audit, cette réponse ne sera pas opposable — c'est le compromis
accepté en échange de la simplicité.

Le mot de passe est vérifié **côté serveur**, par comparaison à durée constante,
au moment de la publication et non à la saisie : connaître l'écran ne suffit pas,
il faut le mot de passe pour que l'écriture aboutisse.

### Mode `auth` — lien magique e-mail · alternative

```
ACCES_PILOTE=auth
PILOTE_EMAILS=pilote1@bioxa.fr,pilote2@bioxa.fr
```

Le pilote saisit son adresse, reçoit un lien de connexion, et publie. `maj_par`
est renseigné automatiquement avec son adresse — traçabilité nominative, celle
que recommande le §9.1.a du PRD.

Côté Supabase (Authentication → URL Configuration), ajoutez en *Redirect URL* :
`https://<votre-domaine>/auth/callback`. Créez les comptes pilotes dans
Authentication → Users : l'application n'autorise pas l'auto-inscription.

La liste blanche est vérifiée **côté serveur** : une personne authentifiée dont
l'adresse n'est pas dans `PILOTE_EMAILS` reçoit un `401`.

### Bascule

Changer `ACCES_PILOTE` dans Vercel puis redéployer suffit. Aucune donnée n'est
perdue : le mode ne concerne que le contrôle d'accès, pas le contenu publié.

---

## Déploiement sur Vercel

1. Poussez ce dépôt sur GitHub, puis **Add New… → Project** sur Vercel et
   importez-le. Next.js est détecté automatiquement, aucun réglage de build
   n'est nécessaire.
2. Dans **Settings → Environment Variables**, ajoutez les six variables du
   tableau ci-dessus (au minimum pour l'environnement *Production*).
3. Déployez.
4. Si vous utilisez le mode `auth`, retournez dans Supabase ajouter l'URL de
   production en *Redirect URL* (étape ci-dessus).

`vercel.json` fixe déjà la région d'exécution à **`fra1` (Francfort)**, conforme
à l'exigence UE du §5 du PRD.

Pour un sous-domaine BIOXA (`chaine.bioxa.fr`), passez par Settings → Domains.

---

## Déploiement en interne (Docker)

```bash
cp .env.docker.example .env    # puis renseigner les valeurs
docker compose up -d --build
```

L'application écoute alors sur `127.0.0.1:3000` ; la publication sur le réseau
passe par un reverse proxy, qui doit **relayer le WebSocket** (sans quoi le
temps réel bascule sur une interrogation toutes les 15 s, ce que la page
signale honnêtement).

La base — Supabase auto-hébergé, ou PostgreSQL après adaptation — est un service
distinct : [`docs/HEBERGEMENT-LOCAL.md`](docs/HEBERGEMENT-LOCAL.md) détaille les
deux options, l'installation, l'exploitation et la recette de validation.

---

## Fidélité à la maquette

La page de lecture reprend `maquette_widget_APTIO.html` à l'identique : structure
d'en-tête, carte statut avec barre latérale colorée, libellé d'état en 44 px
marine, carte analyses, bandeau de message ambré, pied sur deux colonnes. Les
valeurs (couleurs, halos, tailles, gris de texte, rayons) sont reprises telles
quelles dans [`app/globals.css`](app/globals.css).

Deux écarts assumés, tous deux volontaires :

- Le **panneau de démonstration** de la maquette n'est pas repris : il est marqué
  « Absent en production » dans la maquette elle-même.
- Les **accents** sont rétablis (« État de la chaîne », « délais ») : la maquette
  était saisie sans accents, le PRD les utilise.

Le formulaire pilote n'existe pas dans la maquette ; il en reprend le vocabulaire
visuel (cartes 18 px, bordures brume, pastilles d'état, boutons pilule).

## À faire avant diffusion

- **Logo.** `public/logo-bioxa.png` est le logo officiel, détouré et posé sur
  fond transparent, conformément au §7 du PRD — voir
  [`public/LISEZ-MOI-logo.md`](public/LISEZ-MOI-logo.md) pour le remplacer.
- **Conformité.** En hébergement cloud : lancer les DPA Supabase et Vercel, et
  tracer le choix dans la cartographie des traitements (§5 et §10 du PRD). En
  hébergement interne, ces deux points **disparaissent** — c'est le principal
  bénéfice de conformité de la reprise ; la cartographie reste à mettre à jour.

---

## Structure

```
app/
  page.tsx                  Lien LECTURE : chargement serveur, titre et favicon d'état
  AffichageEtat.tsx         Rendu + Realtime + repli + fraîcheur + mode mural
  pilote/
    page.tsx                Lien PILOTE : résout le mode d'accès côté serveur
    FormulairePilote.tsx    Écrans d'accès, formulaire, aperçu, garde-fous
  api/etat/route.ts         ÉCRITURE : accès, validation, concurrence, service role
  auth/callback/route.ts    Retour du lien magique (mode auth)
  composants/
    BlocEtat.tsx            Blocs partagés page de lecture / aperçu pilote
    Entete.tsx              En-tête et libellé de site
    useModeMural.ts         Plein écran, Wake Lock, classe CSS
    NoteGouvernance.tsx     Rappel §10 du PRD
  globals.css               Tokens DA BIOXA et styles
lib/
  acces-pilote.ts           Point de bascule auth / pin (serveur uniquement)
  supabase-serveur.ts       Clients serveur, dont service role (server-only)
  supabase-navigateur.ts    Client navigateur, clé anon
  types.ts                  Modèle de données, présentation des états, favicon
  format.ts                 Horodatage Europe/Paris, ancienneté, péremption
middleware.ts               Rafraîchissement de session sur /pilote et /api/etat
supabase/schema.sql         Table, RLS et Realtime
Dockerfile                  Image de production (dépendances / build / exécution)
docker-compose.yml          Service applicatif, pour l'hébergement interne
docs/
  HEBERGEMENT-LOCAL.md      Dossier technique DSI
  REMISE-DSI.md             Marche à suivre pour la transmission
```

---

## Hors périmètre v1

Historique horodaté, verrou de concurrence, référentiel d'analyses, notification
sonore, multi-site, statistiques — candidats v2 listés au §11 du PRD.
