-- ═══════════════════════════════════════════════════════════════════════════
--  Widget « État de la chaîne APTIO » · schéma Supabase (§8 du PRD v0.2)
--  À exécuter une fois dans le SQL Editor du projet Supabase (région eu-central-1).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.etat_chaine (
  id smallint primary key default 1,
  trafic text not null default 'normal'
    check (trafic in ('normal','retard','retard_important')),
  analyses_toutes_disponibles boolean not null default true,
  -- [{ "analyse": "...", "commentaire": "..." }]
  analyses_indisponibles jsonb not null default '[]'::jsonb,
  message text default '',
  maj_le timestamptz not null default now(),
  maj_par text default '',
  constraint singleton check (id = 1)
);

-- Source unique de vérité : une seule ligne, id = 1.
insert into public.etat_chaine (id) values (1) on conflict do nothing;

-- ── Sécurité ───────────────────────────────────────────────────────────────
-- Lecture publique (clé anon), écriture impossible depuis le navigateur.
alter table public.etat_chaine enable row level security;

drop policy if exists "lecture_publique" on public.etat_chaine;
create policy "lecture_publique"
  on public.etat_chaine
  for select
  using (true);

-- Aucune policy d'insertion / mise à jour / suppression n'est créée :
-- les écritures passent exclusivement par la route serveur /api/etat,
-- qui utilise la clé service role (laquelle contourne la RLS).

-- ── Temps réel ─────────────────────────────────────────────────────────────
-- Ajoute la table à la publication Realtime si elle n'y est pas déjà.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'etat_chaine'
  ) then
    alter publication supabase_realtime add table public.etat_chaine;
  end if;
end
$$;
