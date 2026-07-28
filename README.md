# Widget « État de la chaîne APTIO »

Affichage temps réel de l'état de fonctionnement de la chaîne d'automation APTIO,
mis à jour par le pilote de chaîne et consultable en lecture seule par tout le
laboratoire, via **deux liens distincts**.

Implémentation du PRD v0.2 (`PRD_Widget_Etat_Chaine_APTIO_v0.2.md`).
Pile : **Next.js (App Router) + Supabase**, déployable sur **Vercel**.

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
| `ACCES_PILOTE` | `auth` ou `pin` | Non |
| `PILOTE_EMAILS` | Adresses autorisées (mode `auth`) | Non |
| `PILOTE_PIN` | Code partagé (mode `pin`) | **Oui** |

> Le PRD nomme ces variables `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Elles portent
> ici le préfixe `NEXT_PUBLIC_` imposé par Next.js pour les valeurs que le
> navigateur doit lire — mêmes valeurs, nom conforme au framework.

### 3. Lancement local

```bash
npm install
npm run dev
```

Lecture sur <http://localhost:3000/>, pilote sur <http://localhost:3000/pilote>.

Autres commandes : `npm run build` (build de production), `npm start` (servir ce
build), `npm run typecheck` (vérification TypeScript).

---

## Choisir le mode d'accès pilote (§9.1 du PRD)

Le point d'arbitrage laissé ouvert par le PRD est **implémenté dans les deux
sens**. Tout le mécanisme tient dans un seul fichier, [`lib/acces-pilote.ts`](lib/acces-pilote.ts) :
basculer d'un mode à l'autre ne demande **aucune modification de code**.

### Mode `auth` — lien magique e-mail (recommandé)

```
ACCES_PILOTE=auth
PILOTE_EMAILS=pilote1@bioxa.fr,pilote2@bioxa.fr
```

Le pilote saisit son adresse, reçoit un lien de connexion, et publie. `maj_par`
est renseigné automatiquement avec son adresse — traçabilité nominative.

Côté Supabase (Authentication → URL Configuration), ajoutez en *Redirect URL* :
`https://<votre-domaine>/auth/callback`. Créez les comptes pilotes dans
Authentication → Users : l'application n'autorise pas l'auto-inscription.

La liste blanche est vérifiée **côté serveur** : une personne authentifiée dont
l'adresse n'est pas dans `PILOTE_EMAILS` reçoit un `401`.

### Mode `pin` — code partagé

```
ACCES_PILOTE=pin
PILOTE_PIN=<code choisi>
```

La page `/pilote` demande le code, et le pilote renseigne un champ « poste ou
initiales » qui alimente `maj_par`. Plus simple à déployer, mais l'auteur est
déclaratif et non vérifié.

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

## À faire avant diffusion

- **Logo.** `public/logo-bioxa.svg` est un **placeholder** : le logo BIOXA n'a pas
  été redessiné. Déposez le fichier officiel sous ce nom (voir
  [`public/LISEZ-MOI-logo.md`](public/LISEZ-MOI-logo.md)). Aucune modification de code
  n'est nécessaire.
- **Maquette.** `maquette_widget_APTIO.html` n'était pas disponible au moment du
  développement. La mise en page a été construite à partir des tokens DA du §7 du
  PRD (crème `#F7F2EA`, anthracite `#1E2933`, marine `#14304A`, brume `#D5DBDF`,
  Manrope / Inter, codes couleur d'état). Si la maquette diffère sur un point,
  l'ajustement se fait dans [`app/globals.css`](app/globals.css), où tous les tokens
  sont regroupés en tête de fichier.
- **Conformité.** Lancer les DPA Supabase et Vercel, et tracer le choix
  d'hébergement cloud dans la cartographie des traitements (§5 et §10 du PRD).

---

## Structure

```
app/
  page.tsx                  Lien LECTURE : chargement initial côté serveur
  AffichageEtat.tsx         Rendu + abonnement Realtime (client, clé anon)
  pilote/
    page.tsx                Lien PILOTE : résout le mode d'accès côté serveur
    FormulairePilote.tsx    Écrans d'accès + formulaire de publication
  api/etat/route.ts         ÉCRITURE : contrôle d'accès, validation, clé service role
  auth/callback/route.ts    Retour du lien magique (mode auth)
  composants/               En-tête et note de gouvernance
  globals.css               Tokens DA BIOXA et styles
lib/
  acces-pilote.ts           Point de bascule auth / pin (serveur uniquement)
  supabase-serveur.ts       Clients serveur, dont service role (server-only)
  supabase-navigateur.ts    Client navigateur, clé anon
  types.ts                  Modèle de données et présentation des états
  format.ts                 Horodatage JJ/MM/AAAA HH:MM, fuseau Europe/Paris
middleware.ts               Rafraîchissement de session sur /pilote et /api/etat
supabase/schema.sql         Table, RLS et Realtime
```

---

## Hors périmètre v1

Historique horodaté, verrou de concurrence, référentiel d'analyses, notification
sonore, multi-site, statistiques — candidats v2 listés au §11 du PRD.
