# Marche à suivre — transmettre le widget à la DSI

Document opérationnel. Il décrit **quoi** transmettre, **comment**, et dans
quel ordre, pour que la DSI puisse héberger le widget en interne.

Le dossier technique destiné à la DSI elle-même est
[`HEBERGEMENT-LOCAL.md`](HEBERGEMENT-LOCAL.md). Le présent document s'adresse à
vous, côté laboratoire.

---

## Étape 0 — Ce qu'il faut avoir sous la main

Avant de contacter la DSI, rassemblez :

- l'accès au dépôt GitHub `IsomereFR/WidgetAPTIO` ;
- l'accès au projet Vercel (pour lire les variables d'environnement de
  production, et plus tard pour le désactiver) ;
- l'accès au projet Supabase (pour exporter la donnée et lire les clés) ;
- le nom du référent DSI qui prendra le dossier.

---

## Étape 1 — Vérifier que rien de secret n'est dans le code

À faire **avant** toute transmission. Le dépôt ne doit contenir aucune clé.

```bash
git clone https://github.com/IsomereFR/WidgetAPTIO && cd WidgetAPTIO
grep -rn "eyJ" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yml" . | grep -v node_modules
```

Une clé Supabase est un JWT : elle commence toujours par `eyJ`. **Cette commande
ne doit rien renvoyer.** Les fichiers `.env` et `.env.local` sont exclus par
`.gitignore` ; les fichiers `.env.local.example` et `.env.docker.example` ne
contiennent que des noms de variables, jamais de valeurs.

Si la commande renvoie quelque chose : la clé est compromise dès lors qu'elle a
été poussée. Il faut la régénérer dans Supabase (Project Settings → API →
*Reset*) **avant** de poursuivre, pas seulement la retirer du fichier —
l'historique git la conserve.

---

## Étape 2 — Exporter la donnée existante

Le contenu est minuscule (une ligne), mais l'exporter évite de repartir d'un
écran vide et prouve à la DSI que la reprise fonctionne.

Dans Supabase → SQL Editor :

```sql
select * from public.etat_chaine where id = 1;
```

Copiez le résultat, ou faites un export CSV depuis Table Editor. Ce n'est pas
critique : le pilote peut republier l'état en trente secondes. **Ne joignez pas
cet export au dépôt** — transmettez-le à part si la DSI le demande.

---

## Étape 3 — Choisir le mode de transmission du code

Trois possibilités, par ordre de préférence.

### A. Transfert ou duplication du dépôt GitHub — **recommandé**

La DSI récupère le dépôt tel quel, avec son historique.

- **Duplication** (le laboratoire garde la main) : la DSI crée un dépôt sur son
  GitHub / GitLab interne, puis
  ```bash
  git clone --mirror https://github.com/IsomereFR/WidgetAPTIO
  cd WidgetAPTIO.git
  git push --mirror https://<git-interne>/bioxa/widget-aptio.git
  ```
- **Transfert de propriété** (la DSI reprend tout) : GitHub → Settings →
  *Transfer ownership*.

L'historique est un atout : il documente chaque arbitrage, commit par commit.

### B. Archive git autonome (`git bundle`)

Si la DSI n'a pas d'accès sortant vers GitHub. Un seul fichier, qui contient
tout l'historique et se restaure comme un dépôt normal.

```bash
git bundle create widget-aptio-$(date +%F).bundle --all
sha256sum widget-aptio-$(date +%F).bundle    # empreinte à communiquer à part
```

Côté DSI : `git clone widget-aptio-2026-08-25.bundle widget-aptio`

### C. Archive ZIP du code

Le moins bon : perd l'historique. À réserver au cas où la DSI l'exige.

```bash
git archive --format=zip --prefix=widget-aptio/ -o widget-aptio.zip HEAD
```

---

## Étape 4 — Transmettre les secrets, **séparément**

**Jamais par le même canal que le code, jamais par e-mail, jamais dans le dépôt.**

Six valeurs sont à récupérer dans Vercel → Settings → Environment Variables
(environnement *Production*) :

| Variable | Où la lire | Sensible |
|---|---|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel / Supabase → API | non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel / Supabase → API | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel / Supabase → API | **oui** |
| `ACCES_PILOTE` | Vercel (valeur : `pin`) | non |
| `PILOTE_PIN` | Vercel | **oui** |
| `PILOTE_EMAILS` | Vercel (vide en mode `pin`) | non |

Transmettez-les par le coffre à secrets de l'entreprise, ou à défaut de vive
voix / par un canal distinct de celui du code.

> **Ces valeurs ne serviront que le temps de la bascule.** Dès que la DSI aura
> monté son propre Supabase interne, elle générera ses propres clés, et
> celles-ci deviendront caduques. Prévoyez de toute façon de **changer le
> `PILOTE_PIN`** à la mise en service interne : le mot de passe actuel aura
> circulé pendant la migration.

---

## Étape 5 — Ce que vous envoyez à la DSI

Un message, et deux choses seulement.

**Le code** (étape 3) et **les secrets** (étape 4, canal séparé). Tout le reste
est déjà dans le dépôt :

| Fichier | Ce que c'est |
|---|---|
| `docs/HEBERGEMENT-LOCAL.md` | **Le dossier technique.** Architecture, dépendances, installation, exploitation, recette |
| `README.md` | Vue d'ensemble et mise en place |
| `PRD_Widget_Etat_Chaine_APTIO_v0.2.md` | Le besoin métier d'origine |
| `Dockerfile`, `docker-compose.yml` | De quoi construire et lancer l'application |
| `.env.docker.example` | Les variables à renseigner, commentées |
| `supabase/schema.sql` | Le schéma de base, à exécuter une fois |

### Message type

> Bonjour,
>
> Voici le code source du widget « État de la chaîne APTIO », aujourd'hui
> hébergé sur Vercel + Supabase, en vue d'une reprise en interne.
>
> Le dossier technique est dans le dépôt : `docs/HEBERGEMENT-LOCAL.md`. Il
> décrit l'architecture, les dépendances réelles, la procédure d'installation
> Docker, l'exploitation et une recette de validation en 12 points.
>
> Deux éléments demandent votre arbitrage :
>
> 1. **La base.** L'application s'appuie sur Supabase (PostgreSQL + API REST +
>    temps réel). Deux options sont décrites au §4 : soit Supabase
>    auto-hébergé, qui ne demande **aucune modification de code** ; soit un
>    PostgreSQL nu, plus léger à exploiter mais qui suppose un développement
>    complémentaire, chiffré dans le document.
> 2. **Le nom de domaine interne** et le certificat TLS à utiliser. Le §8
>    précise pourquoi le HTTPS est souhaitable même en interne, et donne un
>    exemple de configuration nginx — le relais WebSocket y est le point à ne
>    pas manquer.
>
> Les secrets (clés Supabase, mot de passe pilote) vous parviennent par
> [canal]. Ils ne servent que le temps de la bascule : vous génèrerez les
> vôtres en montant l'instance interne.
>
> Volumétrie : une ligne en base, quelques mises à jour par jour. Aucune donnée
> patient. Aucun appel à un service externe au runtime.
>
> Je reste disponible pour la recette.

---

## Étape 6 — Après la bascule, fermer l'ancien

À faire **une fois la recette de la DSI validée** (§11 du dossier technique),
et pas avant : gardez le service cloud actif en secours pendant la transition.

1. **Diffuser la nouvelle URL** de lecture aux services, et retirer l'ancienne
   des favoris / affichages muraux.
2. **Regénérer les clés Supabase Cloud** (Project Settings → API → *Reset*) :
   elles ont circulé pendant la migration.
3. **Supprimer le projet Vercel**, ou au minimum retirer les variables
   d'environnement de production.
4. **Exporter puis supprimer le projet Supabase Cloud** une fois la donnée
   reprise en interne.
5. **Mettre à jour la cartographie des traitements** : la sous-traitance
   Supabase et Vercel disparaît, ainsi que la question de la localisation des
   données. C'est le principal bénéfice de conformité de l'opération.
6. **Changer le `PILOTE_PIN`** sur l'instance interne.

---

## Récapitulatif

| # | Étape | Fait |
|:--:|---|:--:|
| 1 | Vérifier qu'aucune clé n'est dans le dépôt | ☐ |
| 2 | Exporter l'état courant de la base | ☐ |
| 3 | Transmettre le code (dépôt, bundle ou archive) | ☐ |
| 4 | Transmettre les secrets, par un canal séparé | ☐ |
| 5 | Envoyer le message avec les deux points d'arbitrage | ☐ |
| 6 | Recette DSI validée (12 points, §11) | ☐ |
| 7 | Diffuser la nouvelle URL aux services | ☐ |
| 8 | Régénérer les clés, fermer Vercel et Supabase Cloud | ☐ |
| 9 | Changer le `PILOTE_PIN` | ☐ |
| 10 | Mettre à jour la cartographie des traitements | ☐ |
