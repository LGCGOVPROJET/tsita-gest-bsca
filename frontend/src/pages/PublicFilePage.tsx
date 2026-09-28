import { PageHeader } from '@/components/ui/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FilingForm } from '@/features/public/FilingForm';

export default function PublicFilePage() {
  useDocumentTitle('Déposer une réclamation');
  return (
    <>
      <PageHeader
        eyebrow="Espace client"
        title="Déposer une réclamation"
        sub="Un formulaire clair, en cinq étapes, utilisable sur téléphone. Aucun compte n'est nécessaire."
      />
      <FilingForm />
    </>
  );
}
