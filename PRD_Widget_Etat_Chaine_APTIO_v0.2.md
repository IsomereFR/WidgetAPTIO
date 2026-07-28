# PRD · Widget « État de la chaîne APTIO » · v0.2

> **Objet.** Afficher en temps réel l'état de fonctionnement de la chaîne d'automation APTIO, mis à jour par le pilote de chaîne et consultable en lecture seule par tout le laboratoire, via **deux liens distincts**.
> **Auteur.** Romain Barbache · Référent IA / Responsable qualité, BIOXA
> **Version.** v0.2 · **Révision.** Hébergement Vercel + Supabase (remplace le serveur interne de la v0.1) · deux liens (lecture / pilote) · temps réel natif.
> **Statut.** À valider avant développement.

---

## 1. Contexte et problème

La chaîne d'automation **APTIO Automation** (fournisseur **Inpeco**, à confirmer côté « IMPECO ») est critique. Toute panne d'automate connecté génère des retards de rendu, parfois importants. L'information circule aujourd'hui de façon informelle, tardive et parfois contradictoire selon les postes.

**Besoin.** Un affichage unique, tenu à jour par le pilote de chaîne, consultable d'un coup d'œil depuis tout poste.

---

## 2. Objectif

Un affichage **unique**, **temps réel**, **partagé**, **maîtrisé** : une seule vérité, propagée instantanément, consultable via une URL publique de lecture, modifiable via une URL réservée au pilote.

---

## 3. Utilisateurs et rôles · deux liens

| Rôle | Qui | Accès | Lien |
|---|---|---|---|
| **Pilote de chaîne** | Poste pilote / technicien de garde | Lit et **modifie** | **Lien pilote** (protégé) |
| **Consultants** | Tous les autres postes (préleveurs, secrétariat, biologistes, sites) | Lit seulement | **Lien lecture** (public interne) |

Les deux liens sont **deux URL distinctes** de la même application (ex. `…/` pour la lecture, `…/pilote` pour l'édition).

---

## 4. Périmètre fonctionnel (v1)

### 4.1 État du trafic · obligatoire, valeur unique

| Niveau | Libellé affiché | Sémantique |
|---|---|---|
| `normal` | **Trafic normal** | Chaîne nominale, délais habituels |
| `retard` | **Retard** | Ralentissement, délais allongés |
| `retard_important` | **Retard important** | Perturbation forte, délais fortement impactés |

### 4.2 État des analyses · deux modes

- **Par défaut** : *« Toutes les analyses disponibles »*.
- **Dégradé** : *« Analyses indisponibles »* → liste d'entrées, chacune = **nom de l'analyse** + **zone de texte libre** (motif, automate, reprise estimée, conduite à tenir).

### 4.3 Métadonnées et message

- **Horodatage** de dernière mise à jour (`JJ/MM/AAAA HH:MM`), posé côté serveur.
- **Auteur** de la mise à jour (idéalement l'identité du pilote connecté, voir §9).
- **Message libre** court optionnel.

### 4.4 Consultation

- Affichage grand format, lisible de loin.
- **Mise à jour temps réel** : dès que le pilote publie, les pages de lecture se rafraîchissent **instantanément** (Supabase Realtime), sans action ni rechargement.
- Lecture seule. Logo BIOXA, palette et typographie DA BIOXA (voir §7).

---

## 5. Exigences non fonctionnelles

- **Source unique de vérité** : une seule ligne d'état en base Supabase.
- **Temps réel** : propagation ≤ 2 s (abonnement Realtime), au lieu d'un polling.
- **Zéro installation / zéro maintenance serveur côté labo** : hébergement géré (Vercel + Supabase), accès par simple URL.
- **Hébergement cloud tiers · révision de posture v0.2.** Contrairement à la v0.1 (100 % interne), les données sont hébergées chez Vercel (frontend / fonctions) et Supabase (base). Conséquences à assumer :
  - **Région UE obligatoire** pour le projet Supabase (Francfort `eu-central-1`) ; fonctions Vercel en région UE (`fra1`).
  - **DPA** à établir avec Supabase et Vercel (chantier conformité à tracer).
  - **Aucune donnée patient** (nom, identifiant, dossier) : interdiction rappelée à la saisie du texte libre. Le garde-fou reste un rappel, pas un contrôle technique.
- **Contrôle d'accès** : lien lecture public interne ; lien pilote protégé (voir §9). Écritures impossibles depuis le lien de lecture, garanties par les règles de sécurité base (RLS, voir §8).
- **Sobriété** : une table, une application, maintenable par une personne.

---

## 6. Architecture · Vercel + Supabase

```
                         [ Supabase · région UE ]
                         table etat_chaine (1 ligne)
                         + Realtime + RLS + Auth
                          /                       \
         (écriture via route serveur,      (lecture temps réel,
          clé service role, protégée)       clé anon, RLS select)
                        /                             \
   [ Lien PILOTE ]  ---/                               \--- [ Lien LECTURE ]
   …/pilote (auth)                                          …/ (public interne)
   pilote de chaîne                                         tous les postes
                         \___________  Vercel  __________/
                            (Next.js : pages + route API)
```

- **Frontend + API** : application **Next.js** déployée sur **Vercel** (page lecture, page pilote, route serveur d'écriture).
- **Données** : **Supabase** (Postgres) héberge l'état ; **Realtime** pousse les changements vers les pages de lecture ; **RLS** garantit que seule la lecture est possible avec la clé publique.
- **Écriture sécurisée** : la publication passe par une **route serveur** Vercel utilisant la **clé service role** Supabase (jamais exposée au navigateur), après vérification de l'accès pilote.
- **Deux liens** : la même application sert `/` (lecture) et `/pilote` (édition), déployés ensemble.

---

## 7. Design · DA BIOXA (inchangé, cf. maquette validée)

Fond crème `#F7F2EA` / blanc, texte anthracite `#1E2933`, titres **Manrope**, corps **Inter**, logo détouré sur réserve claire, épuré, sans smiley.

**Codage couleur des états** (pastille pleine + libellé texte, jamais la couleur seule) :

| État | Couleur | Hex |
|---|---|---|
| Trafic normal | Vert sauge (pastille de statut, usage DA autorisé) | `#6F9080` |
| Retard | Ambre | `#D7A24A` |
| Retard important | Terracotta (alerte forte, sans rouge criard) | `#C0623F` |

Référence visuelle : `maquette_widget_APTIO.html`.

---

## 8. Modèle de données · Supabase

Table unique `etat_chaine` (une seule ligne, `id = 1`) :

```sql
create table public.etat_chaine (
  id smallint primary key default 1,
  trafic text not null default 'normal'
    check (trafic in ('normal','retard','retard_important')),
  analyses_toutes_disponibles boolean not null default true,
  analyses_indisponibles jsonb not null default '[]'::jsonb, -- [{ "analyse":"", "commentaire":"" }]
  message text default '',
  maj_le timestamptz not null default now(),
  maj_par text default '',
  constraint singleton check (id = 1)
);
insert into public.etat_chaine (id) values (1) on conflict do nothing;

-- Sécurité : lecture publique, écriture réservée au serveur
alter table public.etat_chaine enable row level security;
create policy "lecture_publique" on public.etat_chaine for select using (true);
-- Aucune policy d'écriture : les mises à jour passent par la clé service role (route serveur).

-- Temps réel
alter publication supabase_realtime add table public.etat_chaine;
```

Variables d'environnement Vercel :

- `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` (exposables, protégées par RLS)
- `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement, jamais côté client)
- `PILOTE_PIN` **ou** configuration Supabase Auth (voir §9)

---

## 9. Points d'arbitrage · à compléter avant développement

1. **[À COMPLÉTER] Protection du lien pilote.**
   - a) **Supabase Auth** (lien magique par e-mail aux pilotes) — recommandé : identifie qui met à jour, alimente `maj_par`, traçabilité propre.
   - b) **Code PIN partagé** (`PILOTE_PIN`) — plus simple, mais anonyme et plus faible. Repli pragmatique.

2. **[À COMPLÉTER] Lien de lecture.**
   - a) **Public non listé** (URL connue en interne seulement) — simple, acceptable car aucune donnée sensible. Recommandé.
   - b) **Gated** (mot de passe léger) si vous préférez ne rien laisser ouvert.

3. **[À COMPLÉTER] Domaine.**
   - a) Domaine Vercel par défaut (`…​.vercel.app`).
   - b) Sous-domaine BIOXA custom (ex. `chaine.bioxa.fr`) — plus propre pour diffusion interne.

4. **[À COMPLÉTER] Région et DPA.** Confirmer Supabase `eu-central-1` (Francfort) et lancer les DPA Supabase + Vercel.

5. **[À COMPLÉTER] Affichage consultant.** Onglet navigateur simple, ou plein écran « kiosque » sur écran mural ?

---

## 10. Gouvernance · Kalilab et cloud

- Le widget est un **outil de communication interne**, **pas un enregistrement qualité**, et ne remplace aucun circuit documentaire.
- Une panne génératrice de retard peut devoir déclencher une **FNC / action Kalilab** (et le cas échéant un **signalement réactovigilance**). Le widget n'alimente pas ce circuit et ne s'y substitue pas. Le rappel figure sur la page de lecture.
- **Nouveau v0.2 :** l'usage d'un cloud tiers pour un outil interne d'un labo ISO 15189 doit être **tracé** (choix d'hébergement, région UE, DPA, absence de donnée patient). À intégrer à votre cartographie des traitements / registre RGPD.

---

## 11. Hors périmètre v1 (candidats v2)

Historique horodaté des changements (table `historique`) · verrou de concurrence · menu déroulant d'analyses depuis référentiel · notification sonore côté consultant · multi-chaîne / multi-site · statistiques (durée en retard, nombre d'épisodes).

---

## 12. Critères d'acceptation (v1)

- [ ] Deux URL fonctionnelles : lecture (`/`) et pilote (`/pilote`).
- [ ] Depuis le lien pilote, un changement d'état apparaît sur les pages de lecture **en temps réel** (≤ 2 s), sans rechargement.
- [ ] Bascule « analyses indisponibles » : ajout de deux analyses avec commentaire, affichées en lecture, chacune avec son texte ; retour « toutes disponibles » vide la liste.
- [ ] Horodatage de dernière mise à jour correct et visible ; auteur renseigné (selon §9).
- [ ] Le lien de lecture ne permet **aucune** écriture (RLS vérifiée).
- [ ] Le lien pilote est protégé (Auth ou PIN).
- [ ] Projet Supabase en région UE ; clé service role non exposée au client.
- [ ] DA BIOXA respectée ; aucun smiley ; consigne « aucune donnée patient » visible à la saisie.
