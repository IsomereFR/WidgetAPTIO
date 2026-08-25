# ═══════════════════════════════════════════════════════════════════════════
#  Widget « État de la chaîne APTIO » — image de production
#
#  Trois étages : dépendances, build, exécution. Seul le dernier est expédié :
#  l'image finale ne contient ni le code source TypeScript, ni l'outillage de
#  build, ni les dépendances de développement.
#
#  Construction :
#    docker build \
#      --build-arg NEXT_PUBLIC_SUPABASE_URL=https://... \
#      --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#      -t widget-aptio:0.3.0 .
#
#  Voir docs/HEBERGEMENT-LOCAL.md pour la procédure complète.
# ═══════════════════════════════════════════════════════════════════════════

# ── 1. Dépendances ─────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# `npm ci` s'appuie sur le lockfile : versions identiques à celles validées ici.
COPY package.json package-lock.json ./
RUN npm ci

# ── 2. Build ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ┌─────────────────────────────────────────────────────────────────────────┐
# │ POINT D'ATTENTION — variables NEXT_PUBLIC_                              │
# │                                                                         │
# │ Next.js REMPLACE ces variables par leur valeur au moment du BUILD, dans │
# │ le JavaScript envoyé au navigateur. Les fournir au démarrage du         │
# │ conteneur (`docker run -e`) n'a AUCUN effet : l'image contiendrait des  │
# │ valeurs vides et la page afficherait « Configuration Supabase absente ». │
# │                                                                         │
# │ Changer l'une de ces valeurs impose donc de RECONSTRUIRE l'image.       │
# │                                                                         │
# │ Aucune n'est secrète : l'URL et la clé anon sont publiques par          │
# │ conception (la RLS n'autorise que la lecture). Les secrets réels —      │
# │ SUPABASE_SERVICE_ROLE_KEY, PILOTE_PIN — sont injectés à l'exécution et  │
# │ n'entrent jamais dans l'image.                                          │
# └─────────────────────────────────────────────────────────────────────────┘
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_LIBELLE
ARG NEXT_PUBLIC_SEUIL_PERIME_HEURES

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_LIBELLE=$NEXT_PUBLIC_SITE_LIBELLE \
    NEXT_PUBLIC_SEUIL_PERIME_HEURES=$NEXT_PUBLIC_SEUIL_PERIME_HEURES \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── 3. Exécution ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Utilisateur non privilégié : rien ici n'a besoin des droits root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# `standalone` embarque le serveur et ses dépendances ; `static` et `public`
# doivent être copiés à part, Next ne les y intègre pas.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Sonde de vitalité : la page de lecture répond même base injoignable (elle
# affiche « État indisponible »), ce qui en fait un bon test du serveur lui-même.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
