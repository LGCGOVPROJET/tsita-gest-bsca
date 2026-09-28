import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Check,
  Clock3,
  Gem,
  Menu,
  MessageSquareText,
  Paperclip,
  PenLine,
  ScanSearch,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/lib/auth-context';
import { homePathFor } from '@/lib/permissions';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';
import { FilingForm } from '@/features/public/FilingForm';
import '@/styles/home.css';

const REF_RE = /^TG-BSCA-\d{4}-\d{4,6}$/i;

const STEPS = [
  { title: 'Vous déposez', text: 'Votre demande et vos justificatifs sont associés à une référence unique.' },
  { title: 'Nous qualifions', text: 'Le dossier est orienté vers la fonction responsable de son traitement.' },
  { title: 'Nous recherchons', text: 'Les faits sont examinés et une solution est préparée puis validée.' },
  { title: 'Vous recevez une réponse', text: 'La décision motivée et les étapes éventuelles vous sont communiquées.' },
];

const FEATURES = [
  { icon: ScanSearch, title: 'Référence unique', text: 'Chaque demande possède un identifiant pour retrouver facilement son évolution.' },
  { icon: Clock3, title: 'Étapes visibles', text: 'Un statut compréhensible vous indique où se trouve votre demande.' },
  { icon: Paperclip, title: 'Justificatifs réunis', text: 'Les documents transmis restent liés au même dossier, du dépôt à la réponse.' },
  { icon: MessageSquareText, title: 'Réponse motivée', text: 'La solution proposée est expliquée avec les informations utiles.' },
  { icon: Gem, title: 'Amélioration continue', text: 'Les causes récurrentes alimentent des actions correctives suivies.' },
  { icon: ShieldCheck, title: 'Confidentialité', text: 'Vos données sont protégées ; les notes internes des équipes ne vous sont jamais exposées ni publiées.' },
];

const FAQ = [
  {
    q: 'Comment déposer une réclamation ?',
    a: "Cliquez sur « Déposer une réclamation » : un formulaire en cinq étapes vous guide (identité, objet, faits, pièces, vérification). Vous pouvez aussi vous adresser à une agence, au centre de contact ou écrire au service réclamations : votre demande sera enregistrée dans le même parcours.",
  },
  {
    q: 'Comment retrouver mon dossier ?',
    a: "À la fin du dépôt, vous recevez une référence (TG-BSCA-…) et un code de suivi personnel de 8 caractères, affiché une seule fois. Les deux sont nécessaires pour consulter votre dossier et protègent l'accès à vos informations.",
  },
  {
    q: 'Quel est le délai de réponse ?',
    a: "Le délai applicable est indiqué dans votre accusé de réception. Les délais affichés dans cet environnement sont des valeurs de démonstration, en attente de validation par la conformité de BSCA Bank.",
  },
  {
    q: 'Mes informations sont-elles visibles par tous ?',
    a: "Non. Seuls les profils habilités accèdent à votre dossier, et les notes internes des équipes sont séparées des messages qui vous sont destinés.",
  },
  {
    q: 'Et si la réponse ne me convient pas ?',
    a: 'Depuis le suivi de votre demande, vous pouvez demander une réouverture motivée. Le dossier initial et la réponse reçue restent consultables.',
  },
];

/** Fenêtre modale native : focus piégé, Échap, contenu conservé à la fermeture (aucune saisie perdue). */
function Dialog({ id, open, onClose, eyebrow, title, wide, children }: { id: string; open: boolean; onClose: () => void; eyebrow: string; title: string; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus sur le premier champ (repli : bouton de fermeture), pour une saisie immédiate au clavier.
      const first = d.querySelector<HTMLElement>('form input:not([type="hidden"]), form select, form textarea') ?? d.querySelector<HTMLElement>('.lp-close');
      first?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`lp-dialog${wide ? ' wide' : ''}`}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lp-dialog-panel">
        <div className="lp-dialog-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          <button type="button" className="lp-close" onClick={onClose} aria-label="Fermer la fenêtre">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Page d'accueil publique — maquette « TSITA_GEST_BSCA_Accueil_Maquette_V1 », branchée sur les vrais parcours. */
export default function HomePage() {
  useDocumentTitle('Accueil');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<'filing' | 'tracking' | null>(null);
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ reference?: string; code?: string }>({});

  const open = (m: 'filing' | 'tracking') => {
    setMenuOpen(false);
    setModal(m);
  };

  const onTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = reference.trim().toUpperCase();
    const c = code.trim().toUpperCase();
    const errs: typeof errors = {};
    if (!REF_RE.test(ref)) errs.reference = 'Format attendu : TG-BSCA-AAAA-NNNNNN.';
    if (c.length !== 8) errs.code = 'Le code de suivi comporte 8 caractères.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setModal(null);
    // Le code de suivi ne passe jamais dans l'URL : il est transmis en mémoire à la page de suivi.
    navigate('/suivi', { state: { reference: ref, tracking_code: c } });
  };

  const staffHome = user && user.role !== 'client' ? homePathFor(user) : null;
  const spaceLink = user?.role === 'client'
    ? { to: '/client', label: 'Mes réclamations' }
    : staffHome
      ? { to: staffHome, label: 'Espace collaborateur' }
      : { to: '/connexion', label: 'Se connecter' };

  return (
    <div className="lp">
      <a href="#accueil" className="skip-link">
        Aller au contenu principal
      </a>
      <div className="lp-topline" aria-hidden="true" />
      <div className="lp-utility">
        <div className="lp-container">
          <span>TSITA GEST · Service de gestion des réclamations</span>
          <nav aria-label="Accès aux espaces" className="lp-utility-links">
            <Link to="/connexion?espace=client">Espace client</Link>
            <span aria-hidden="true">·</span>
            <Link to={staffHome ?? '/connexion'}>Espace collaborateur</Link>
          </nav>
        </div>
      </div>

      <header className="lp-header">
        <div className="lp-container">
          <a href="#accueil" aria-label="BSCA Bank — retour en haut de l'accueil">
            <img className="lp-logo" src="/bsca-wide.png" alt="BSCA Bank — Banque Sino-Congolaise pour l'Afrique" width={214} height={55} />
          </a>
          <nav aria-label="Navigation principale" className="lp-nav">
            <a href="#fonctionnement">Comment ça marche</a>
            <a href="#services">Le service</a>
            <a href="#questions">Questions fréquentes</a>
          </nav>
          <div className="lp-header-actions">
            <button type="button" className="btn alt lp-btn-outline" onClick={() => open('tracking')}>
              Suivre ma demande
            </button>
            <button type="button" className="btn lp-btn" onClick={() => open('filing')}>
              Déposer une réclamation
            </button>
            <button
              type="button"
              className="lp-menu"
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={menuOpen}
              aria-controls="lp-menu-panel"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
          <div className={`lp-menu-panel${menuOpen ? ' open' : ''}`} id="lp-menu-panel">
            <a href="#fonctionnement" onClick={() => setMenuOpen(false)}>Comment ça marche</a>
            <a href="#services" onClick={() => setMenuOpen(false)}>Le service</a>
            <a href="#questions" onClick={() => setMenuOpen(false)}>Questions fréquentes</a>
            <Link to={spaceLink.to}>{spaceLink.label}</Link>
            <button type="button" className="btn alt lp-btn-outline" onClick={() => open('tracking')}>
              Suivre ma demande
            </button>
            <button type="button" className="btn lp-btn" onClick={() => open('filing')}>
              Déposer une réclamation
            </button>
          </div>
        </div>
      </header>

      <main id="accueil" tabIndex={-1}>
        {/* ——— Héros ——— */}
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-container">
            <div className="lp-hero-copy">
              <span className="eyebrow">Bienvenue sur TSITA GEST</span>
              <h1 id="lp-title">
                Votre réclamation, <em>notre engagement</em> à trouver une solution.
              </h1>
              <p>
                Un espace simple pour signaler une difficulté, transmettre vos justificatifs et suivre chaque étape de votre demande auprès de
                BSCA Bank.
              </p>
              <div className="lp-hero-buttons">
                <button type="button" className="btn lp-btn" onClick={() => open('filing')}>
                  Déposer une réclamation <ArrowRight size={17} aria-hidden="true" />
                </button>
                <button type="button" className="btn alt lp-btn-outline" onClick={() => open('tracking')}>
                  Suivre ma demande
                </button>
              </div>
              <ul className="lp-trust" aria-label="Nos engagements">
                <li>
                  <i aria-hidden="true"><Check size={13} /></i> Référence de suivi
                </li>
                <li>
                  <i aria-hidden="true"><Check size={13} /></i> Étapes transparentes
                </li>
                <li>
                  <i aria-hidden="true"><Check size={13} /></i> Échanges sécurisés
                </li>
              </ul>
            </div>

            <div className="lp-art" role="img" aria-label="Illustration : exemple fictif de suivi d'une réclamation en cours d'analyse">
              <div className="lp-stripe" />
              <div className="lp-mock" aria-hidden="true">
                <div className="lp-mock-top">
                  <img src="/bsca-mark.png" alt="" width={22} height={22} /> Suivi de votre demande
                </div>
                <div className="lp-mock-inner">
                  <small>RÉCLAMATION EN COURS · EXEMPLE FICTIF</small>
                  <h3>Votre dossier avance</h3>
                  <span className="lp-mock-ref">TG-BSCA-2026-000018</span>
                  <div className="lp-progress">
                    <div><span><Check size={13} /></span>Reçue</div>
                    <div><span><Check size={13} /></span>Qualifiée</div>
                    <div><span>3</span>Analyse</div>
                    <div><span>4</span>Réponse</div>
                  </div>
                  <div className="lp-slim" />
                  <div className="lp-slim short" />
                  <div className="lp-mock-foot">
                    <span>Prochaine étape : examen de votre demande</span>
                    <b>En cours</b>
                  </div>
                </div>
              </div>
              <div className="lp-floating" aria-hidden="true">
                <i><Check size={15} /></i> Une information à chaque étape
              </div>
            </div>
          </div>
        </section>

        <div className="lp-statline">
          <ol className="lp-container">
            <li>01 <b>Déposez votre demande</b></li>
            <li>02 <b>Suivez son traitement</b></li>
            <li>03 <b>Recevez une réponse</b></li>
          </ol>
        </div>

        {/* ——— Deux accès ——— */}
        <section className="lp-section" id="services" aria-labelledby="lp-services">
          <div className="lp-container">
            <div className="lp-sectionhead">
              <span className="eyebrow">Que souhaitez-vous faire ?</span>
              <h2 id="lp-services">Deux accès, un seul suivi clair.</h2>
              <p>Choisissez l'action qui correspond à votre situation. Aucun compte n'est nécessaire.</p>
            </div>
            <div className="lp-choices">
              <article className="lp-choice">
                <div className="lp-glyph"><PenLine size={22} aria-hidden="true" /></div>
                <h3>Déposer une réclamation</h3>
                <p>Décrivez le problème rencontré, précisez le produit concerné et joignez les documents utiles au traitement.</p>
                <button type="button" className="lp-textlink" onClick={() => open('filing')}>
                  Commencer ma demande <ArrowRight size={16} aria-hidden="true" />
                </button>
              </article>
              <article className="lp-choice">
                <div className="lp-glyph"><Search size={22} aria-hidden="true" /></div>
                <h3>Suivre une demande</h3>
                <p>Retrouvez les étapes, les messages et les documents associés à votre référence de dossier.</p>
                <button type="button" className="lp-textlink" onClick={() => open('tracking')}>
                  Consulter mon suivi <ArrowRight size={16} aria-hidden="true" />
                </button>
              </article>
            </div>
          </div>
        </section>

        {/* ——— Parcours ——— */}
        <section className="lp-section tinted" id="fonctionnement" aria-labelledby="lp-steps">
          <div className="lp-container">
            <div className="lp-sectionhead">
              <span className="eyebrow">Parcours de traitement</span>
              <h2 id="lp-steps">De la réception à la solution.</h2>
              <p>TSITA GEST aide les équipes à documenter chaque décision et à vous répondre de manière compréhensible.</p>
            </div>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="lp-step">
                  <strong aria-hidden="true">{String(i + 1).padStart(2, '0')}</strong>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ——— Atouts ——— */}
        <section className="lp-section" aria-labelledby="lp-features">
          <div className="lp-container">
            <div className="lp-sectionhead">
              <span className="eyebrow">Un service pensé pour vous</span>
              <h2 id="lp-features">Simple à utiliser, rigoureux dans le suivi.</h2>
            </div>
            <div className="lp-features">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <article key={title} className="lp-feature">
                  <div className="lp-ico"><Icon size={19} aria-hidden="true" /></div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ——— FAQ ——— */}
        <section className="lp-section tinted" id="questions" aria-labelledby="lp-faq">
          <div className="lp-container lp-split">
            <div>
              <div className="lp-sectionhead">
                <span className="eyebrow">Questions fréquentes</span>
                <h2 id="lp-faq">Les réponses avant de commencer.</h2>
                <p>Les canaux disponibles et les délais affichés seront confirmés par BSCA Bank avant l'ouverture du service.</p>
              </div>
              <div className="lp-faq">
                {FAQ.map(({ q, a }) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </div>
            <aside className="lp-confidence" aria-label="Identité BSCA Bank">
              <div className="lp-seal">
                <img src="/bsca-mark.png" alt="" width={48} height={48} />
              </div>
              <span className="eyebrow">Identité BSCA Bank</span>
              <h3>Une relation client plus claire, à chaque étape.</h3>
              <p>La plateforme réunit le client, les équipes de traitement et la supervision autour d'un dossier traçable.</p>
              <div className="lp-smallbox">Environnement de démonstration : les dossiers affichés sont fictifs et les délais restent à valider par la conformité BSCA.</div>
            </aside>
          </div>
        </section>

        {/* ——— Appel à l'action ——— */}
        <section className="lp-cta" aria-labelledby="lp-cta-title">
          <div className="lp-container">
            <div>
              <h2 id="lp-cta-title">Besoin de signaler une difficulté ?</h2>
              <p>Déposez votre réclamation en quelques minutes : une référence vous est attribuée immédiatement.</p>
            </div>
            <button type="button" className="btn lp-btn-white" onClick={() => open('filing')}>
              Ouvrir le formulaire <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-grid">
          <div>
            <img src="/bsca-wide.png" alt="BSCA Bank" width={220} height={56} />
            <p>TSITA GEST · Portail de gestion des réclamations de BSCA Bank — Banque Sino-Congolaise pour l'Afrique.</p>
          </div>
          <div>
            <h3>Découvrir</h3>
            <a href="#services">Le service</a>
            <a href="#fonctionnement">Comment ça marche</a>
            <a href="#questions">Questions fréquentes</a>
          </div>
          <div>
            <h3>Accès</h3>
            <button type="button" onClick={() => open('filing')}>Déposer une réclamation</button>
            <button type="button" onClick={() => open('tracking')}>Suivre une demande</button>
            <Link to="/connexion?espace=client">Espace client</Link>
            <Link to={staffHome ?? '/connexion'}>Espace collaborateur</Link>
          </div>
        </div>
        <div className="lp-container">
          <div className="lp-copyright">© 2026 TSITA GEST × BSCA Bank · Environnement de démonstration · données fictives.</div>
        </div>
      </footer>

      <Dialog id="lp-filing" open={modal === 'filing'} onClose={() => setModal(null)} eyebrow="Formulaire public" title="Déposer une réclamation" wide>
        <p className="lp-dialog-sub">Cinq étapes courtes. Si vous fermez cette fenêtre, vos saisies sont conservées jusqu'à votre retour.</p>
        <FilingForm compact />
      </Dialog>

      <Dialog id="lp-tracking" open={modal === 'tracking'} onClose={() => setModal(null)} eyebrow="Espace client" title="Suivre une demande">
        <p className="lp-dialog-sub">Saisissez la référence et le code de suivi reçus lors du dépôt.</p>
        <form onSubmit={onTrack} noValidate>
          <Input
            label="Référence du dossier"
            required
            placeholder="TG-BSCA-2026-000123"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            error={errors.reference}
          />
          <Input
            label="Code de suivi"
            required
            placeholder="8 caractères"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={errors.code}
            className="mono-input"
          />
          <Button type="submit" className="lp-full" icon={<ArrowRight size={16} aria-hidden="true" />}>
            Afficher le suivi
          </Button>
        </form>
        <InfoBox tone="info" className="lp-dialog-note">
          Code perdu ? Adressez-vous à votre agence avec votre référence : après vérification de votre identité, un nouveau code vous sera remis.
        </InfoBox>
      </Dialog>
    </div>
  );
}
