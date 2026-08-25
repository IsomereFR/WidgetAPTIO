'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { BandeauMessage, CarteAnalyses, CarteStatut } from '../composants/BlocEtat'
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
  const routeur = useRouter()

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
  // Vrai entre la publication réussie et l'arrivée sur la page de lecture :
  // maintient le bouton désactivé pour empêcher une double publication.
  const [redirection, setRedirection] = useState(false)
  const [retour, setRetour] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null)
  const [dernierePublication, setDernierePublication] = useState(etatInitial.maj_le)
  /**
   * Publication concurrente détectée par le serveur (409). Tant qu'elle n'est
   * pas levée, republier écraserait l'annonce d'un autre poste.
   */
  const [conflit, setConflit] = useState<{ maj_le: string; maj_par: string } | null>(null)
  const [apercuVisible, setApercuVisible] = useState(false)

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

  /**
   * L'ordre de la liste est l'ordre d'affichage pour tout le laboratoire.
   * Sans moyen de le changer, remonter une analyse critique au-dessus d'une
   * autre obligeait à retaper les deux lignes.
   */
  const deplacerAnalyse = (index: number, sens: -1 | 1) => {
    setAnalyses((precedent) => {
      const cible = index + sens
      if (cible < 0 || cible >= precedent.length) return precedent
      const copie = [...precedent]
      ;[copie[index], copie[cible]] = [copie[cible], copie[index]]
      return copie
    })
  }

  // ── Brouillon non publié ─────────────────────────────────────────────────
  // Le formulaire est pré-rempli : rien ne distingue visuellement « ce qui est
  // affiché dans le laboratoire » de « ce que je viens de taper ». On compare
  // donc la saisie à l'état publié, et on le dit.
  const empreinte = (
    valeurs: Pick<EtatChaine, 'trafic' | 'analyses_toutes_disponibles' | 'message'> & {
      analyses: AnalyseIndisponible[]
    },
  ) =>
    JSON.stringify({
      trafic: valeurs.trafic,
      toutes: valeurs.analyses_toutes_disponibles,
      // Quand tout est disponible, la liste est ignorée à la publication :
      // la neutraliser ici évite de signaler un « brouillon » invisible.
      analyses: valeurs.analyses_toutes_disponibles ? [] : valeurs.analyses,
      message: valeurs.message.trim(),
    })

  const [empreintePubliee, setEmpreintePubliee] = useState(() =>
    empreinte({
      trafic: etatInitial.trafic,
      analyses_toutes_disponibles: etatInitial.analyses_toutes_disponibles,
      analyses: etatInitial.analyses_indisponibles,
      message: etatInitial.message,
    }),
  )

  const brouillonModifie =
    empreinte({
      trafic,
      analyses_toutes_disponibles: toutesDisponibles,
      analyses,
      message,
    }) !== empreintePubliee

  // Fermer l'onglet en croyant avoir publié est l'erreur la plus coûteuse de
  // ce formulaire : le laboratoire continue alors d'afficher l'état précédent.
  useEffect(() => {
    if (!brouillonModifie || redirection) return
    const avertir = (evenement: BeforeUnloadEvent) => {
      evenement.preventDefault()
      evenement.returnValue = ''
    }
    window.addEventListener('beforeunload', avertir)
    return () => window.removeEventListener('beforeunload', avertir)
  }, [brouillonModifie, redirection])

  // ── Publication vers la route serveur ────────────────────────────────────
  const publier = async (evenement: FormEvent) => {
    evenement.preventDefault()
    setEnvoiEnCours(true)
    setRetour(null)
    setConflit(null)

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
          // État sur lequel ce formulaire a travaillé : permet au serveur de
          // refuser l'écrasement d'une publication faite entre-temps.
          maj_le_connu: dernierePublication || undefined,
        }),
      })

      const charge = await reponse.json().catch(() => ({}))

      if (!reponse.ok) {
        if (reponse.status === 401 && mode === 'pin') {
          // PIN refusé : on le purge pour forcer une nouvelle saisie.
          window.sessionStorage.removeItem(CLE_PIN_SESSION)
          setPinValide(false)
        }
        if (reponse.status === 409 && charge?.conflit) {
          setConflit({
            maj_le: String(charge.conflit.maj_le ?? ''),
            maj_par: String(charge.conflit.maj_par ?? ''),
          })
        }
        setRetour({
          type: 'erreur',
          texte: charge?.erreur || `Publication refusée (code ${reponse.status}).`,
        })
        setEnvoiEnCours(false)
        return
      }

      if (mode === 'pin') window.sessionStorage.setItem(CLE_PIN_SESSION, pin)
      setDernierePublication(charge?.etat?.maj_le || '')
      // La saisie devient la référence : plus aucun « brouillon non publié ».
      setEmpreintePubliee(
        empreinte({
          trafic,
          analyses_toutes_disponibles: toutesDisponibles,
          analyses,
          message,
        }),
      )
      setRetour({
        type: 'succes',
        texte: 'État publié. Redirection vers la page de lecture…',
      })

      // Retour à la page de lecture après publication. Le court délai laisse la
      // confirmation s'afficher : sans lui, le pilote ne saurait pas si la
      // publication a abouti ou si la page a simplement changé toute seule.
      setRedirection(true)
      window.setTimeout(() => {
        routeur.push('/')
        routeur.refresh()
      }, 900)
      // On sort sans repasser par le `finally` : le bouton doit rester
      // désactivé pendant la redirection, sinon un double clic republie.
      return
    } catch {
      setRetour({
        type: 'erreur',
        texte: 'Publication impossible : le serveur est injoignable. Réessayez.',
      })
    }

    setEnvoiEnCours(false)
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

  // Aperçu : on applique EXACTEMENT les mêmes règles que la route d'écriture —
  // lignes vides écartées, liste neutralisée si tout est disponible. Un aperçu
  // qui montrerait des lignes vides annoncerait un affichage qui n'existera pas.
  const analysesApercu = toutesDisponibles
    ? []
    : analyses.filter(
        (entree) =>
          entree.analyse.trim() !== '' ||
          entree.reprise.trim() !== '' ||
          entree.commentaire.trim() !== '',
      )
  const toutesDisponiblesApercu = toutesDisponibles || analysesApercu.length === 0

  return (
    <Enveloppe>
      <div className="pilote-entete">
        <h2 className="pilote-titre">Publier l&apos;état de la chaîne</h2>
        <div className="pilote-entete-actions">
          {brouillonModifie ? (
            <span className="badge-brouillon" role="status">
              Modifications non publiées
            </span>
          ) : null}
          <Link href="/" className="lien-lecture">
            Voir la page de lecture →
          </Link>
        </div>
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
                    <span className="ligne-analyse-numero">
                      Analyse {index + 1} sur {analyses.length}
                    </span>
                    <div className="ligne-analyse-outils">
                      <button
                        type="button"
                        className="btn btn-ordre"
                        onClick={() => deplacerAnalyse(index, -1)}
                        disabled={index === 0}
                        aria-label={`Remonter l'analyse ${index + 1}`}
                        title="Remonter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ordre"
                        onClick={() => deplacerAnalyse(index, 1)}
                        disabled={index === analyses.length - 1}
                        aria-label={`Descendre l'analyse ${index + 1}`}
                        title="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-retrait"
                        onClick={() => retirerAnalyse(index)}
                      >
                        − Retirer
                      </button>
                    </div>
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

        {/* ── Aperçu ──
            Le pilote publie pour tout le laboratoire sans jamais voir le
            résultat avant l'envoi. L'aperçu réutilise les composants de la page
            de lecture : ce qui s'affiche ici est ce qui s'affichera là-bas. */}
        <section className="card carte-apercu">
          <div className="apercu-entete">
            <h2 style={{ marginBottom: 0 }}>
              <span className="ic" aria-hidden="true" />
              Aperçu
            </h2>
            <button
              type="button"
              className="btn"
              onClick={() => setApercuVisible((precedent) => !precedent)}
              aria-expanded={apercuVisible}
            >
              {apercuVisible ? 'Masquer' : 'Voir ce que verront les services'}
            </button>
          </div>

          {apercuVisible ? (
            <div className="apercu-scene" aria-label="Aperçu de la page de lecture">
              <CarteStatut presentation={PRESENTATION_TRAFIC[trafic]} />
              <CarteAnalyses
                etatDisponible
                toutesDisponibles={toutesDisponiblesApercu}
                analyses={analysesApercu}
              />
              {message.trim() ? <BandeauMessage message={message} /> : null}
            </div>
          ) : null}
        </section>

        {/* ── Publication ── */}
        <section className="card">
          <div className="actions-publication">
            <button
              type="submit"
              className="btn btn-principal"
              disabled={envoiEnCours || redirection}
            >
              {redirection ? 'Publié' : envoiEnCours ? 'Publication…' : "Publier l'état"}
            </button>
            {horodatage ? (
              <span className="mention">Dernière publication : {horodatage}</span>
            ) : null}
          </div>

          {/* Conflit : message dédié, avec la sortie de secours. Un simple
              « publication refusée » laisserait le pilote sans savoir quoi faire. */}
          {conflit ? (
            <div className="encart encart-erreur" style={{ marginTop: 16 }} role="alert">
              <span className="ic" aria-hidden="true" />
              <span>
                <strong>Publication interrompue : un autre poste a publié entre-temps</strong>
                <br />
                État en ligne depuis {formaterHorodatage(conflit.maj_le) || 'un instant'}
                {conflit.maj_par ? ` (${conflit.maj_par})` : ''}. Votre saisie n&apos;a pas été
                enregistrée, pour ne pas effacer cette annonce. Rechargez pour repartir de
                l&apos;état courant, puis ressaisissez vos modifications.
                <br />
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 10 }}
                  onClick={() => window.location.reload()}
                >
                  Recharger l&apos;état courant
                </button>
              </span>
            </div>
          ) : retour ? (
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
