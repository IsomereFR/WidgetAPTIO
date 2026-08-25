# Hébergement local — dossier technique

Document destiné à la DSI. Il décrit ce qu'est l'application, ce dont elle
dépend réellement, et comment l'héberger sur l'infrastructure du laboratoire
en remplacement de Vercel + Supabase Cloud.

**Version applicative concernée :** 0.3.0
**Périmètre :** affichage interne de l'état de la chaîne d'automation APTIO.
**Données traitées :** aucune donnée patient (voir §10).

---

## 1. Ce qu'est l'application

Une application web **Next.js 15** (React 19, TypeScript) qui expose deux URL
sur le même domaine :

| URL | Usage | Accès |
|---|---|---|
| `/` | Lecture — tous les postes du laboratoire, écrans de couloir | Ouvert sur le réseau interne, lecture seule |
| `/pilote` | Publication de l'état — poste pilote | Protégé (mot de passe partagé, ou lien magique e-mail) |

À quoi s'ajoutent deux routes serveur : `/api/etat` (seul chemin d'écriture) et
`/auth/callback` (retour du lien magique, utilisé uniquement en mode `auth`).

**Volumétrie.** La base contient **une seule ligne**, mise à jour quelques fois
par jour. Le dimensionnement n'est pas un sujet : la contrainte est la
disponibilité, pas la charge.

---

## 2. Architecture — deux briques, pas une

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│  Application Next.js     │        │  Base de données              │
│  (ce dépôt)              │───────▶│  PostgreSQL + API             │
│                          │        │  (Supabase)                   │
│  · rendu des pages       │  HTTP  │                               │
│  · route d'écriture      │   +    │  · table `etat_chaine`        │
│  · contrôle d'accès      │  WSS   │  · 1 ligne (id = 1)           │
└──────────────────────────┘        └───────────────────────────────┘
         ▲                                        ▲
         │ HTTPS                                  │ HTTPS + WebSocket
         │                                        │
    Postes du laboratoire ───────────────────────┘
    (le navigateur parle AUX DEUX)
```

**Point structurant :** le navigateur des postes n'appelle pas que
l'application — il ouvre aussi une connexion directe vers la base, pour recevoir
les changements en temps réel. **L'URL de la base doit donc être joignable
depuis les postes du laboratoire**, pas seulement depuis le serveur applicatif.

---

## 3. Ce dont l'application dépend exactement

Elle n'utilise que **trois** briques de Supabase :

| Brique | Usage | Indispensable ? |
|---|---|---|
| **PostgREST** | Lecture et écriture de la ligne `etat_chaine` via HTTP | Oui |
| **Realtime** | Notification instantanée d'un changement (WebSocket) | Non — repli automatique en interrogation toutes les 15 s |
| **GoTrue (Auth)** | Lien magique e-mail | Non — uniquement si `ACCES_PILOTE=auth` |

Aucun stockage de fichiers, aucune fonction edge, aucun job planifié.

**Conséquence pratique :** si le Realtime n'est pas disponible (WebSocket non
relayé par le proxy, brique non déployée), l'application le détecte, bascule sur
une interrogation périodique et **l'affiche honnêtement** — l'indicateur en haut
à droite passe de « Actualisation auto » à « Actualisation différée ». Rien ne
casse ; le délai de propagation passe de l'instantané à 15 secondes maximum.

### Dépendances logicielles

Aucune dépendance propriétaire, aucun service tiers appelé au runtime :

```
@supabase/ssr, @supabase/supabase-js   client de la base
next, react, react-dom                 framework
server-only                            garde-fou de compilation
```

Les polices (Inter, Manrope) sont **téléchargées au build et auto-hébergées** :
aucune requête vers Google Fonts depuis les postes. Le logo est un fichier
statique du dépôt. **L'application ne contacte donc aucun domaine externe.**

---

## 4. Deux options d'hébergement

### Option A — Supabase auto-hébergé · **recommandée**

Supabase est **open source** et publie une distribution Docker officielle. La
DSI l'installe sur un serveur interne, et l'application fonctionne **sans
aucune modification de code**.

- ✅ Zéro développement, zéro régression à craindre.
- ✅ Le temps réel est conservé.
- ⚠️ La distribution comporte une dizaine de conteneurs (PostgreSQL, PostgREST,
  Realtime, GoTrue, Kong, Studio…). C'est plus lourd que ce que l'application
  utilise, mais c'est un ensemble maintenu et documenté par l'éditeur.

### Option B — PostgreSQL seul + adaptation du code

Remplacer Supabase par un PostgreSQL nu et réécrire la couche d'accès.

- ✅ Deux conteneurs au lieu de douze ; s'appuie sur un SGBD que la DSI
  administre probablement déjà.
- ⚠️ Demande un développement (voir ci-dessous), non inclus à ce jour.

**Ampleur du chantier.** Tout l'accès à la base est concentré dans quatre
fichiers — c'est une contrainte tenue depuis l'origine, précisément pour rendre
ce remplacement possible :

| Fichier | Ce qu'il faudrait faire |
|---|---|
| `lib/supabase-serveur.ts` | Remplacer par un pool `pg` |
| `lib/supabase-navigateur.ts` | Supprimer : le navigateur n'appellerait plus la base directement |
| `app/AffichageEtat.tsx` | Remplacer l'abonnement Realtime par un flux SSE servi par l'application |
| `app/api/etat/route.ts` | Remplacer l'`upsert` par un `INSERT … ON CONFLICT` |

Le temps réel se réimplémente avec `LISTEN`/`NOTIFY` PostgreSQL côté serveur et
`EventSource` côté navigateur. Le mode `auth` (lien magique) serait à remplacer
par le SSO du laboratoire, ou abandonné au profit du mode `pin`, déjà retenu.

**Recommandation :** commencer par l'option A pour tenir le calendrier de sortie
du cloud, et n'envisager l'option B que si la DSI juge la distribution Supabase
trop lourde à exploiter dans la durée. Le passage de A à B ne change rien pour
les utilisateurs : mêmes URL, même affichage.

La suite de ce document décrit **l'option A**.

---

## 5. Prérequis serveur

| Élément | Valeur |
|---|---|
| Système | Linux x86-64, Docker ≥ 24 et le plugin Compose |
| Processeur / mémoire | 2 vCPU et 4 Go pour l'ensemble (widget + Supabase) |
| Disque | 20 Go — la base est minuscule, l'espace sert aux images et aux journaux |
| Réseau | Serveur joignable depuis les postes ; **WebSocket relayé** par le proxy |
| Certificat | TLS interne recommandé (voir §8) |
| Fuseau | `Europe/Paris` (`TZ` est déjà positionnée dans `docker-compose.yml`) |

Le serveur n'a **pas** besoin d'accès Internet en fonctionnement. Il en a besoin
**une fois**, pour construire l'image (téléchargement des dépendances npm et des
polices). En environnement fermé, construire l'image sur un poste raccordé puis
la transférer avec `docker save` / `docker load`.

---

## 6. Installation

### 6.1 Base — Supabase auto-hébergé

Suivre la procédure officielle : <https://supabase.com/docs/guides/self-hosting/docker>.

```bash
git clone --depth 1 https://github.com/supabase/supabase
cp -r supabase/docker /opt/supabase && cd /opt/supabase
cp .env.example .env
```

**Avant de démarrer**, régénérer dans `.env` **tous** les secrets d'exemple :
`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`DASHBOARD_PASSWORD`. Ceux livrés dans le fichier d'exemple sont publics et
connus de tous — les conserver reviendrait à laisser la base ouverte.

Renseigner également `SITE_URL` et `API_EXTERNAL_URL` avec l'URL par laquelle
les postes joindront Supabase (ce sera la valeur de `NEXT_PUBLIC_SUPABASE_URL`).

```bash
docker compose up -d
```

### 6.2 Schéma de la base

Exécuter [`supabase/schema.sql`](../supabase/schema.sql) — depuis le Studio
(`http://<serveur>:8000`, section SQL Editor) ou en ligne de commande :

```bash
docker compose exec -T db psql -U postgres -d postgres < /chemin/vers/supabase/schema.sql
```

Le script est **idempotent** : il crée la table `etat_chaine` si elle n'existe
pas, insère l'unique ligne `id = 1`, active la RLS avec la seule policy de
lecture, et inscrit la table à la publication Realtime.

> **Sécurité — à vérifier après exécution.** La RLS ne définit **aucune** policy
> d'écriture. Les écritures passent exclusivement par la route serveur
> `/api/etat` avec la clé `service_role`. Un navigateur, même muni de la clé
> `anon` et même depuis la console, se voit refuser toute écriture **par la base
> elle-même**.

### 6.3 Application

```bash
cd /opt/widget-aptio          # dépôt reçu
cp .env.docker.example .env   # puis renseigner (§7)
docker compose up -d --build
```

L'application écoute alors sur `127.0.0.1:3000`. C'est volontaire : la
publication sur le réseau passe par le reverse proxy (§8).

---

## 7. Variables d'environnement

| Variable | Rôle | Secrète | Lue au |
|---|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de l'API Supabase, **joignable depuis les postes** | non | **build** + runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique, lecture seule via RLS | non | **build** + runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Écriture serveur — contourne la RLS | **oui** | runtime |
| `ACCES_PILOTE` | `pin` (retenu) ou `auth` | non | runtime |
| `PILOTE_PIN` | Mot de passe unique, mode `pin` | **oui** | runtime |
| `PILOTE_EMAILS` | Adresses autorisées, mode `auth` | non | runtime |
| `NEXT_PUBLIC_SITE_LIBELLE` | Sous-titre de l'en-tête | non | **build** |
| `NEXT_PUBLIC_SEUIL_PERIME_HEURES` | Seuil d'alerte de péremption (défaut 12) | non | **build** |

> ### ⚠️ Les variables `NEXT_PUBLIC_` sont figées au BUILD
>
> Next.js remplace ces variables par leur valeur **dans le JavaScript envoyé au
> navigateur**, au moment de la construction de l'image. Les modifier dans
> `.env` puis redémarrer le conteneur **n'a aucun effet**.
>
> Après modification d'une variable `NEXT_PUBLIC_`, reconstruire :
> ```bash
> docker compose up -d --build
> ```
> Les autres variables (`SUPABASE_SERVICE_ROLE_KEY`, `PILOTE_PIN`, …) sont lues
> au démarrage : un simple `docker compose restart` suffit.
>
> C'est la cause la plus fréquente d'un « Configuration Supabase absente »
> affiché alors que le `.env` semble correct.

---

## 8. Reverse proxy et TLS

Exemple nginx. Le point à ne pas manquer est le relais WebSocket : sans lui, le
temps réel ne s'établit pas et l'application bascule en mode différé (15 s).

```nginx
server {
    listen 443 ssl;
    server_name chaine.bioxa.local;

    ssl_certificate     /etc/ssl/certs/bioxa-interne.crt;
    ssl_certificate_key /etc/ssl/private/bioxa-interne.key;

    # ── Application ──
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name supabase.bioxa.local;   # = NEXT_PUBLIC_SUPABASE_URL

    ssl_certificate     /etc/ssl/certs/bioxa-interne.crt;
    ssl_certificate_key /etc/ssl/private/bioxa-interne.key;

    location / {
        proxy_pass http://127.0.0.1:8000;   # Kong (passerelle Supabase)
        proxy_http_version 1.1;

        # ── Indispensable au temps réel ──
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_read_timeout 3600s;   # une page murale garde la connexion ouverte
    }
}
```

**Pourquoi le HTTPS, sur un réseau interne ?** Deux raisons concrètes :

1. Le **mode mural** maintient l'écran allumé via l'API Wake Lock, qui exige un
   contexte sécurisé (HTTPS ou `localhost`). En HTTP nu sur une adresse IP, le
   plein écran et l'agrandissement fonctionnent, mais l'écran s'éteindra selon
   la mise en veille du poste.
2. Une page servie en HTTPS ne peut pas ouvrir de WebSocket vers une base en
   HTTP : **les deux domaines doivent être dans le même régime**. Servir les
   deux en HTTPS est le plus simple.

---

## 9. Exploitation

### Sauvegarde

Une ligne de texte : la sauvegarde tient dans un `pg_dump` quotidien.

```bash
docker compose -f /opt/supabase/docker-compose.yml exec -T db \
  pg_dump -U postgres -d postgres -t public.etat_chaine \
  > /sauvegardes/etat_chaine_$(date +%F).sql
```

**La vraie perte en cas de sinistre n'est pas la donnée** (un état publié
quelques heures plus tôt, que le pilote republiera en trente secondes) **mais la
configuration** : le `.env` de Supabase — qui contient `JWT_SECRET`, sans lequel
les clés `anon` et `service_role` deviennent invalides — et le `.env` de
l'application. Les sauvegarder dans le coffre à secrets de la DSI, pas à côté
du dump.

### Restauration

```bash
docker compose exec -T db psql -U postgres -d postgres < /sauvegardes/etat_chaine_AAAA-MM-JJ.sql
```

### Supervision

| Quoi | Comment |
|---|---|
| Application vivante | `HEALTHCHECK` intégré : `docker inspect --format '{{.State.Health.Status}}' widget-aptio` |
| Chaîne complète | `curl -fs https://chaine.bioxa.local/ \| grep -q "Trafic\\|État indisponible"` |
| Base joignable | La page affiche « État indisponible » (gris) quand elle ne l'est pas — jamais du vert |
| Journaux | `docker compose logs -f widget` — rotation déjà configurée (5 × 10 Mo) |

**Point de conception à connaître de la supervision :** l'application ne montre
**jamais** un « Trafic normal » vert lorsque la base est injoignable. Elle
affiche un état gris « État indisponible » explicite. Un écran vert signifie
donc toujours « la chaîne va bien », jamais « le service est tombé ».

### Mise à jour

```bash
cd /opt/widget-aptio
git pull                       # ou décompression de l'archive reçue
docker compose up -d --build
```

L'interruption est de quelques secondes. Les données ne sont pas touchées : la
base est un service distinct.

---

## 10. Sécurité et conformité

### Comment l'écriture est verrouillée — trois barrières cumulées

1. **Le navigateur ne peut pas écrire.** Les pages n'utilisent que la clé
   `anon`. La RLS ne définit qu'une policy `SELECT` ; aucune policy d'écriture
   n'existe. Une tentative d'écriture est refusée **par la base**.
2. **L'écriture passe par le serveur.** Seul `app/api/etat/route.ts` écrit, avec
   la clé `service_role`. Cette clé n'est jamais préfixée `NEXT_PUBLIC_`, et le
   module qui la lit est marqué `server-only` : toute tentative de l'importer
   depuis un composant client **fait échouer la compilation**.
3. **La route vérifie le pilote.** Mot de passe partagé (comparaison à durée
   constante) ou session e-mail avec liste blanche. Sans preuve valable : `401`.

L'horodatage `maj_le` est posé par le serveur : l'heure du poste client n'est
jamais utilisée.

### Données

Le widget ne traite **aucune donnée patient**. Les champs libres (nom d'analyse,
reprise estimée, précision, message) sont destinés à des informations
d'exploitation ; la consigne « Ne saisir AUCUNE donnée patient » est affichée
dans le formulaire, au-dessus de chaque zone de saisie libre.

L'hébergement local **supprime** les deux points ouverts du dossier de
conformité liés au cloud : la sous-traitance Supabase et Vercel (DPA), et la
localisation des données. À tracer dans la cartographie des traitements.

### Journalisation

L'application ne journalise aucun contenu métier : uniquement les journaux
d'accès HTTP standard de Next.js. Aucune télémétrie n'est émise
(`NEXT_TELEMETRY_DISABLED=1` dans l'image).

---

## 11. Recette de validation

À dérouler après installation, avant diffusion du lien aux services.

| # | Test | Résultat attendu |
|:--:|---|---|
| 1 | Ouvrir `/` depuis un poste du laboratoire | La page s'affiche ; l'indicateur passe à « Actualisation auto » sous ~2 s |
| 2 | Ouvrir `/pilote`, saisir un mauvais mot de passe, publier | Refus `401`, message explicite, aucune écriture |
| 3 | Publier « Retard » depuis `/pilote` | Redirection vers `/`, état en ambre |
| 4 | Garder `/` ouverte sur un 2ᵉ poste pendant le test 3 | La page **change toute seule**, sans rechargement |
| 5 | Ouvrir l'aperçu du formulaire avant publication | L'aperçu correspond exactement à ce qui s'affichera |
| 6 | Publier depuis deux postes simultanément | Le second reçoit « un autre poste a publié entre-temps » ; **rien n'est écrasé** |
| 7 | Arrêter Supabase, recharger `/` | « État indisponible » **en gris** — jamais du vert |
| 8 | Redémarrer Supabase | La page se rétablit seule |
| 9 | Cliquer « Mode mural » | Plein écran, texte agrandi, lien pilote masqué |
| 10 | Vérifier l'onglet du navigateur | Titre et pastille de favicon portent la couleur de l'état |
| 11 | Avancer l'horloge de plus de 12 h (ou attendre) | Bandeau « État non confirmé depuis plus de 12 h » |
| 12 | Depuis la console d'un poste, tenter une écriture avec la clé `anon` | Refus de la base (RLS) |

Le test **6** vérifie le garde-fou de concurrence, et le test **7** la règle
« jamais de vert par défaut ». Ce sont les deux qui protègent contre une
information fausse affichée avec l'apparence d'une information sûre.

---

## 12. Où lire quoi, dans le code

```
app/
  page.tsx                  Lecture : chargement serveur, titre et favicon dynamiques
  AffichageEtat.tsx         Rendu + abonnement temps réel + repli + mode mural
  pilote/
    page.tsx                Résolution du mode d'accès, côté serveur
    FormulairePilote.tsx    Écrans d'accès, formulaire, aperçu, garde-fou de concurrence
  api/etat/route.ts         ÉCRITURE : accès, validation, concurrence, clé service role
  auth/callback/route.ts    Retour du lien magique (mode auth)
  composants/
    BlocEtat.tsx            Blocs partagés page de lecture / aperçu pilote
    Entete.tsx              En-tête, libellé de site
    useModeMural.ts         Plein écran, Wake Lock, classe CSS
  globals.css               Tokens de la charte et styles
lib/
  acces-pilote.ts           Point de bascule pin / auth — SERVEUR UNIQUEMENT
  supabase-serveur.ts       Clients serveur, dont service role (server-only)
  supabase-navigateur.ts    Client navigateur, clé anon
  types.ts                  Modèle de données, présentation des états, favicon
  format.ts                 Horodatage, ancienneté, seuil de péremption
middleware.ts               Rafraîchissement de session sur /pilote et /api/etat
supabase/schema.sql         Table, RLS, Realtime
Dockerfile                  Image de production (3 étages)
docker-compose.yml          Service applicatif
```

---

## 13. Contacts et suites

- **Arbitrage à confirmer avec la DSI :** option A (Supabase auto-hébergé) ou
  option B (PostgreSQL + adaptation). Voir §4.
- **Mode d'accès pilote :** `pin` est le mode retenu. Le mode `auth` reste
  disponible sans modification de code si la DSI exige une traçabilité
  nominative — il suffit de changer `ACCES_PILOTE` et de reconstruire.
- **Hors périmètre v1**, candidats v2 : historique horodaté des publications,
  référentiel d'analyses, multi-site, statistiques.
