import type { Metadata, Viewport } from 'next'
import { Inter, Manrope } from 'next/font/google'

import './globals.css'

/**
 * Polices DA BIOXA (§7 du PRD).
 * `next/font` télécharge et auto-héberge les fichiers au moment du build :
 * aucune requête vers un CDN externe au runtime.
 */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--police-manrope',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--police-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'État de la chaîne APTIO · BIOXA',
  description:
    "Affichage temps réel de l'état de fonctionnement de la chaîne d'automation APTIO.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#F7F2EA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
