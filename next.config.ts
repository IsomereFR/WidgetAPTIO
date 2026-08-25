import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Sortie « standalone » : le build produit `.next/standalone`, qui embarque
   * un serveur Node autonome et les seules dépendances réellement utilisées.
   *
   * Sans elle, héberger l'application suppose de transporter `node_modules`
   * en entier (plusieurs centaines de Mo) sur le serveur cible. Avec elle,
   * l'image Docker de production tient dans quelques dizaines de Mo et ne
   * contient ni le code source, ni l'outillage de build.
   *
   * `next start` et `npm run dev` continuent de fonctionner à l'identique.
   */
  output: 'standalone',
}

export default nextConfig
