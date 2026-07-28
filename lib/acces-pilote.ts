import 'server-only'

import { timingSafeEqual } from 'node:crypto'

import { supabaseSessionServeur } from './supabase-serveur'

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  POINT D'ARBITRAGE §9.1 DU PRD — PROTECTION DU LIEN PILOTE
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  Tout le mécanisme d'accès pilote est concentré ici. Pour basculer d'un mode
 *  à l'autre, il suffit de changer la variable d'environnement ACCES_PILOTE :
 *
 *    ACCES_PILOTE=auth  → lien magique Supabase Auth ; seuls les e-mails listés
 *                         dans PILOTE_EMAILS peuvent publier ; `maj_par` est
 *                         l'e-mail du pilote connecté (traçabilité nominative).
 *
 *    ACCES_PILOTE=pin   → code PIN partagé (PILOTE_PIN) ; `maj_par` est le champ
 *                         « poste / initiales » saisi par le pilote.
 *
 *  Aucun autre fichier n'a besoin d'être modifié : la page /pilote et la route
 *  d'écriture consomment uniquement ce module.
 *
 *  ARBITRAGE RETENU : « pin ». Un mot de passe unique, partagé par les postes
 *  qui tiennent la chaîne. Conséquence à assumer : `maj_par` n'est plus une
 *  identité vérifiée mais un champ déclaratif (« poste ou initiales ») saisi
 *  par le pilote. Le mode « auth » reste entièrement fonctionnel si vous
 *  souhaitez plus tard une traçabilité nominative : il suffit de changer
 *  ACCES_PILOTE et de renseigner PILOTE_EMAILS.
 */

export type ModeAccesPilote = 'auth' | 'pin'

/**
 * Mode par défaut : « pin », conformément à l'arbitrage retenu.
 * Si la variable est absente ET que PILOTE_PIN l'est aussi, la route d'écriture
 * refuse tout (401) : l'absence de configuration ne laisse jamais l'accès ouvert.
 */
const MODE_PAR_DEFAUT: ModeAccesPilote = 'pin'

export function modeAccesPilote(): ModeAccesPilote {
  const brut = (process.env.ACCES_PILOTE || '').trim().toLowerCase()
  if (brut === 'pin') return 'pin'
  if (brut === 'auth') return 'auth'
  return MODE_PAR_DEFAUT
}

/** Liste blanche des pilotes autorisés (mode « auth »). */
export function emailsPilotes(): string[] {
  return (process.env.PILOTE_EMAILS || '')
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/** Comparaison à durée constante, pour ne pas laisser fuiter le PIN par timing. */
function comparaisonSure(a: string, b: string): boolean {
  const tamponA = Buffer.from(a, 'utf8')
  const tamponB = Buffer.from(b, 'utf8')
  if (tamponA.length !== tamponB.length) return false
  return timingSafeEqual(tamponA, tamponB)
}

export type ResultatAcces =
  | { autorise: true; majPar: string }
  | { autorise: false; motif: string }

/**
 * Vérifie que la requête d'écriture provient bien d'un pilote habilité.
 *
 * @param pinFourni  PIN transmis par la page pilote (mode « pin » uniquement).
 * @param auteurSaisi Champ « poste / initiales » (mode « pin » uniquement).
 */
export async function verifierAccesPilote(
  pinFourni: string | null,
  auteurSaisi: string,
): Promise<ResultatAcces> {
  const mode = modeAccesPilote()

  if (mode === 'pin') {
    const pinAttendu = (process.env.PILOTE_PIN || '').trim()
    if (!pinAttendu) {
      return { autorise: false, motif: 'Accès pilote non configuré (PILOTE_PIN manquant).' }
    }
    if (!pinFourni || !comparaisonSure(pinFourni.trim(), pinAttendu)) {
      return { autorise: false, motif: 'Code PIN absent ou incorrect.' }
    }
    return { autorise: true, majPar: auteurSaisi.trim().slice(0, 120) }
  }

  // Mode « auth » : la session doit exister ET l'e-mail doit figurer dans la liste blanche.
  const supabase = await supabaseSessionServeur()
  if (!supabase) {
    return { autorise: false, motif: 'Accès pilote non configuré (variables Supabase manquantes).' }
  }

  const { data, error } = await supabase.auth.getUser()
  const email = data?.user?.email?.trim().toLowerCase()
  if (error || !email) {
    return { autorise: false, motif: 'Session absente ou expirée. Reconnectez-vous.' }
  }

  const autorises = emailsPilotes()
  if (autorises.length === 0) {
    return { autorise: false, motif: 'Accès pilote non configuré (PILOTE_EMAILS manquant).' }
  }
  if (!autorises.includes(email)) {
    return { autorise: false, motif: "Ce compte n'est pas autorisé à publier l'état." }
  }

  return { autorise: true, majPar: email }
}
