'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'

import { formaterHorodatage } from '@/lib/format'
import { supabaseNavigateur } from '@/lib/supabase-navigateur'
import {
  PRESENTATION_TRAFIC,
  TRAFICS,
  type AnalyseIndisponible,
  type EtatChaine,
  type Trafic,
} from '@/lib/types'
import Entete from '../composants/Entete'

type ModeAcces = 'auth' | 'pin'

const CLE_PIN_SESSION = 'aptio_pilote_pin'

const CONSIGNE_DONNEES = 'Ne saisir AUCUNE donnée patient (nom, identifiant, dossier).'

export default function FormulairePilote({
  mode,
  etatInitial,
}: {
  mode: ModeAcces
  etatInitial: EtatChaine
}) {
  // ── Formulaire, pré-rempli avec l'état courant ────────────────────────────
  const [trafic, setTrafic] = useState<Trafic>(etatInitial.trafic)
  const [toutesDisponibles, setToutesDisponibles] = useState(etatInitial.analyses_toutes_disponibles)
  const [analyses, setAnalyses] = useState<AnalyseIndisponible[]>(
    etatInitial.analyses_indisponibles.length > 0
      ? etatInitial.analyses_indisponibles
      : [{ analyse: '', reprise: '', commentaire: '' }],
  )
  const [message, setMessage] = useState(etatInitial.message)
  const [auteur, setAuteur] = useState(mode === 'pin' ? etatInitial.maj_par : '')

  // ── Publication ───────────────────────────────────────────────────────────
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [retour, setRetour] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null)
  const [dernierePublication, setDernierePublication] = useState(etatInitial.maj_le)

  // ── Accès : PIN ───────────────────────────────────────────────────────────
  const [pin, setPin] = useState('')
  const [pinValide, setPinValide] = useState(false)

  useEffect(() => {
    if (mode !== 'pin') return
    const enregistre = window.sessionStorage.getItem(CLE_PIN_SESSION)
    if (enregistre) {
      setPin(enregistre)
      setPinValide(true)
    }
  }, [mode])

  // ── Accès : Supabase Auth ────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChargee, setSessionChargee] = useState(mode !== 'auth')
  const [email, setEmail] = useState('')
  const [lienEnvoye, setLienEnvoye] = useState(false)
  const [erreurAuth, setErreurAuth] = useState('')

  useEffect(() => {
    if (mode !== 'auth') return
    const supabase = supabaseNavigateur()
    if (!supabase) {
      setSessionChargee(true)
      return
    }

    let annule = false
    supabase.auth.getSession().then(({ data }) => {
      if (annule) return
      setSession(data.session)
      setSessionChargee(true)
    })

    const { data: abonnement } = supabase.auth.onAuthStateChange((_evenement, nouvelle) => {
      if (!annule) setSession(nouvelle)
    })

    return () => {
      annule = true
      abonnement.subscription.unsubscribe()
    }
  }, [mode])

  const envoyerLienMagique = useCallback(
    async (evenement: FormEvent) => {
      evenement.preventDefault()
      setErreurAuth('')
      const supabase = supabaseNavigateur()
      if (!supabase) {
        setErreurAuth('Configuration Supabase absente.')
        return
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/pilote`,
          shouldCreateUser: false,
        },
      })
      if (error) {
        setErreurAuth(
          "Envoi impossible. Vérifiez l'adresse : seuls les comptes pilotes déclarés peuvent recevoir un lien.",
        )
        return
      }
      setLienEnvoye(true)
    },
    [email],
  )

  const seDeconnecter = useCallback(async () => {
    const supabase = supabaseNavigateur()
    if (supabase) await supabase.auth.signOut()
    setSession(null)
  }, [])

  // ── Manipulation de la liste d'analyses ──────────────────────────────────
  const modifierAnalyse = (index: number, champ: keyof AnalyseIndisponible, valeur: string) => {
    setAnalyses((precedent) =>
      precedent.map((entree, i) => (i === index ? { ...entree, [champ]: valeur } : entree)),
    )
  }

  const ajouterAnalyse = () => {
    setAnalyses((precedent) => [...precedent, { analyse: '', reprise: '', commentaire: '' }])
  }

  const retirerAnalyse = (index: number) => {
    setAnalyses((precedent) => {
      const restant = precedent.filter((_, i) => i !== index)
      return restant.length > 0 ? restant : [{ analyse: '', reprise: '', commentaire: '' }]
    })
  }

  // ── Publication vers la route serveur ────────────────────────────────────
  const publier = async (evenement: FormEvent) => {
    evenement.preventDefault()
    setEnvoiEnCours(true)
    setRetour(null)

    const entetes: Record<string, string> = { 'Content-Type': 'application/json' }
    if (mode === 'pin' && pin) entetes['x-pilote-pin'] = pin

    try {
      const reponse = await fetch('/api/etat', {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify({
          trafic,
          analyses_toutes_disponibles: toutesDisponibles,
          analyses_indisponibles: toutesDisponibles ? [] : analyses,
          message,
          maj_par: mode === 'pin' ? auteur : undefined,
        }),
      })

      const charge = await reponse.json().catch(() => ({}))

      if (!reponse.ok) {
        if (reponse.status === 401 && mode === 'pin') {
          // PIN refusé : on le purge pour forcer une nouvelle saisie.
          window.sessionStorage.removeItem(CLE_PIN_SESSION)
          setPinValide(false)
        }
        setRetour({
          type: 'erreur',
          texte: charge?.erreur || `Publication refusée (code ${reponse.status}).`,
        })
        return
      }

      if (mode === 'pin') window.sessionStorage.setItem(CLE_PIN_SESSION, pin)
      setDernierePublication(charge?.etat?.maj_le || '')
      setRetour({ type: 'succes', texte: 'État publié. Les pages de lecture sont à jour.' })
    } catch {
      setRetour({
        type: 'erreur',
        texte: 'Publication impossible : le serveur est injoignable. Réessayez.',
      })
    } finally {
      setEnvoiEnCours(false)
    }
  }

  // ── Écrans d'accès ────────────────────────────────────────────────────────

  if (mode === 'pin' && !pinValide) {
    return (
      <Enveloppe>
        <section className="card bloc-connexion">
          <h2>
            <span className="ic" aria-hidden="true" />
            Accès pilote
          </h2>
          <form
            onSubmit={(evenement) => {
              evenement.preventDefault()
              if (pin.trim()) setPinValide(true)
            }}
          >
            <label className="champ">
              <span className="champ-intitule">Code PIN</span>
              <input
                type="password"
                value={pin}
                onChange={(evenement) => setPin(evenement.target.value)}
                autoComplete="off"
                autoFocus
                inputMode="numeric"
                required
              />
            </label>
            <button type="submit" className="btn btn-principal">
              Accéder
            </button>
          </form>
          <p className="mention" style={{ marginTop: 16 }}>
            Le code est vérifié par le serveur au moment de la publication.
          </p>
        </section>
      </Enveloppe>
    )
  }

  if (mode === 'auth' && !sessionChargee) {
    return (
      <Enveloppe>
        <section className="card bloc-connexion">
          <p className="mention">Vérification de la session…</p>
        </section>
      </Enveloppe>
    )
  }

  if (mode === 'auth' && !session) {
    return (
      <Enveloppe>
        <section className="card bloc-connexion">
          <h2>
            <span className="ic" aria-hidden="true" />
            Accès pilote
          </h2>
          {lienEnvoye ? (
            <div className="encart encart-succes">
              <span className="ic" aria-hidden="true" />
              <span>
                Lien de connexion envoyé à {email.trim()}. Ouvrez-le depuis ce poste pour accéder
                à la publication.
              </span>
            </div>
          ) : (
            <form onSubmit={envoyerLienMagique}>
              <label className="champ">
                <span className="champ-intitule">
                  Adresse e-mail
                  <span className="champ-aide">
                    Seules les adresses déclarées comme pilotes peuvent publier.
                  </span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(evenement) => setEmail(evenement.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
              {erreurAuth ? (
                <div className="encart encart-erreur" style={{ marginBottom: 18 }}>
                  <span className="ic" aria-hidden="true" />
                  <span>{erreurAuth}</span>
                </div>
              ) : null}
              <button type="submit" className="btn btn-principal">
                Recevoir un lien de connexion
              </button>
            </form>
          )}
        </section>
      </Enveloppe>
    )
  }

  // ── Formulaire de publication ─────────────────────────────────────────────

  const horodatage = formaterHorodatage(dernierePublication)

  return (
    <Enveloppe>
      <div className="pilote-entete">
        <h2 className="pilote-titre">Publier l&apos;état de la chaîne</h2>
        <Link href="/" className="lien-lecture">
          Voir la page de lecture →
        </Link>
      </div>

      {mode === 'auth' && session?.user?.email ? (
        <section className="card" style={{ padding: '16px 22px' }}>
          <div className="actions-publication" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13.5 }}>
              Connecté en tant que <strong>{session.user.email}</strong>
            </span>
            <button type="button" className="btn" onClick={seDeconnecter}>
              Se déconnecter
            </button>
          </div>
        </section>
      ) : null}

      <form onSubmit={publier}>
        {/* ── Trafic ── */}
        <section className="card">
          <h2>
            <span className="ic" aria-hidden="true" />
            Trafic de la chaîne
          </h2>
          <div className="choix-trafic" role="group" aria-label="État du trafic">
            {TRAFICS.map((niveau) => {
              const presentation = PRESENTATION_TRAFIC[niveau]
              return (
                <button
                  key={niveau}
                  type="button"
                  className="option-trafic"
                  aria-pressed={trafic === niveau}
                  onClick={() => setTrafic(niveau)}
                  style={
                    {
                      '--couleur-option': presentation.couleur,
                      '--halo-option': presentation.halo,
                    } as CSSProperties
                  }
                >
                  <span className="option-pastille" aria-hidden="true" />
                  {presentation.libelle}
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Analyses ── */}
        <section className="card">
          <h2>
            <span className="ic" aria-hidden="true" />
            Analyses
          </h2>

          <div className="bascule" role="group" aria-label="Disponibilité des analyses">
            <button
              type="button"
              className="bascule-option"
              aria-pressed={toutesDisponibles}
              onClick={() => setToutesDisponibles(true)}
            >
              Toutes disponibles
            </button>
            <button
              type="button"
              className="bascule-option"
              aria-pressed={!toutesDisponibles}
              onClick={() => setToutesDisponibles(false)}
            >
              Certaines indisponibles
            </button>
          </div>

          {!toutesDisponibles ? (
            <>
              <hr className="separateur" />

              <div className="encart encart-consigne" style={{ marginBottom: 16 }}>
                <span className="ic" aria-hidden="true" />
                <span>{CONSIGNE_DONNEES}</span>
              </div>

              {analyses.map((entree, index) => (
                <div className="ligne-analyse" key={index}>
                  <div className="ligne-analyse-entete">
                    <span className="ligne-analyse-numero">Analyse {index + 1}</span>
                    <button
                      type="button"
                      className="btn btn-retrait"
                      onClick={() => retirerAnalyse(index)}
                    >
                      − Retirer
                    </button>
                  </div>

                  <label className="champ">
                    <span className="champ-intitule">Nom de l&apos;analyse</span>
                    <input
                      type="text"
                      value={entree.analyse}
                      onChange={(evenement) =>
                        modifierAnalyse(index, 'analyse', evenement.target.value)
                      }
                      maxLength={200}
                    />
                  </label>

                  <label className="champ">
                    <span className="champ-intitule">
                      Reprise estimée
                      <span className="champ-aide">
                        Une heure, une date, ou une incertitude assumée : « vers 14h »,
                        « 29/07 matin », « en cours d&apos;évaluation ».
                      </span>
                    </span>
                    <input
                      type="text"
                      value={entree.reprise}
                      onChange={(evenement) =>
                        modifierAnalyse(index, 'reprise', evenement.target.value)
                      }
                      maxLength={120}
                      placeholder="vers 14h"
                    />
                  </label>

                  <label className="champ" style={{ marginBottom: 0 }}>
                    <span className="champ-intitule">
                      Précision
                      <span className="champ-aide">
                        Motif, automate concerné, conduite à tenir.
                      </span>
                    </span>
                    <textarea
                      value={entree.commentaire}
                      onChange={(evenement) =>
                        modifierAnalyse(index, 'commentaire', evenement.target.value)
                      }
                      maxLength={1000}
                      rows={3}
                    />
                  </label>
                </div>
              ))}

              <button
                type="button"
                className="btn"
                style={{ marginTop: 14 }}
                onClick={ajouterAnalyse}
              >
                + Ajouter une analyse
              </button>
            </>
          ) : null}
        </section>

        {/* ── Message libre ── */}
        <section className="card">
          <h2>
            <span className="ic" aria-hidden="true" />
            Message (optionnel)
          </h2>

          <div className="encart encart-consigne" style={{ marginBottom: 16 }}>
            <span className="ic" aria-hidden="true" />
            <span>{CONSIGNE_DONNEES}</span>
          </div>

          <label className="champ" style={{ marginBottom: 0 }}>
            <span className="visuellement-masque">Message libre</span>
            <textarea
              value={message}
              onChange={(evenement) => setMessage(evenement.target.value)}
              maxLength={600}
              rows={3}
              placeholder="Information courte à destination de tous les postes."
            />
          </label>
        </section>

        {/* ── Auteur (mode PIN) ── */}
        {mode === 'pin' ? (
          <section className="card">
            <h2>
              <span className="ic" aria-hidden="true" />
              Auteur de la mise à jour
            </h2>
            <label className="champ" style={{ marginBottom: 0, maxWidth: 400 }}>
              <span className="champ-intitule">
                Poste ou initiales
                <span className="champ-aide">Affiché à côté de l&apos;horodatage.</span>
              </span>
              <input
                type="text"
                value={auteur}
                onChange={(evenement) => setAuteur(evenement.target.value)}
                maxLength={120}
              />
            </label>
          </section>
        ) : null}

        {/* ── Publication ── */}
        <section className="card">
          <div className="actions-publication">
            <button type="submit" className="btn btn-principal" disabled={envoiEnCours}>
              {envoiEnCours ? 'Publication…' : "Publier l'état"}
            </button>
            {horodatage ? (
              <span className="mention">Dernière publication : {horodatage}</span>
            ) : null}
          </div>

          {retour ? (
            <div
              className={`encart ${retour.type === 'succes' ? 'encart-succes' : 'encart-erreur'}`}
              style={{ marginTop: 16 }}
              role="status"
            >
              <span className="ic" aria-hidden="true" />
              <span>{retour.texte}</span>
            </div>
          ) : null}
        </section>
      </form>
    </Enveloppe>
  )
}

function Enveloppe({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <Entete sousTitre="Espace pilote · publication de l'état" />
      {children}
    </div>
  )
}
