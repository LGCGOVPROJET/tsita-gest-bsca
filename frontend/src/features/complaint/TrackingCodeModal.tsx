import { useState } from 'react';
import { CheckCircle2, Copy, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { InfoBox } from '@/components/ui/InfoBox';

/**
 * Code de suivi à remettre au client (saisie agent, réouverture) : affiché une seule fois,
 * jamais stocké côté navigateur ; seul son hash est conservé par le serveur.
 */
export function TrackingCodeModal({ reference, code, onClose, title = 'Dossier enregistré' }: { reference: string; code: string; onClose: () => void; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Remettez ces informations au client : elles lui permettent de suivre sa demande sans compte."
      footer={
        <>
          <Button variant="alt" icon={<Printer size={15} aria-hidden="true" />} onClick={() => window.print()}>
            Imprimer
          </Button>
          <Button onClick={onClose}>J'ai remis le code · ouvrir le dossier</Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="secret-box">
          <div>
            <div className="secret-label">Référence</div>
            <div className="secret-value">{reference}</div>
          </div>
        </div>
        <div className="secret-box accent">
          <div>
            <div className="secret-label">Code de suivi</div>
            <div className="secret-value">{code}</div>
          </div>
          <Button
            variant="alt"
            size="sm"
            icon={copied ? <CheckCircle2 size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${reference} — ${code}`);
                setCopied(true);
              } catch {
                /* presse-papiers indisponible */
              }
            }}
            aria-label="Copier la référence et le code de suivi"
          >
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
      </div>
      <InfoBox tone="warn" role="alert">
        <strong>Ce code ne sera plus jamais affiché.</strong> Il n'est ni conservé dans le dossier ni récupérable : notez-le ou imprimez-le maintenant.
      </InfoBox>
    </Modal>
  );
}
