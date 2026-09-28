import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeadlineBadge, StatusBadge } from '@/components/ui/Badge';
import type { DeadlineFlag } from '@/types/api';

describe('DeadlineBadge', () => {
  const cases: [DeadlineFlag, string, string][] = [
    ['ok', 'Dans les délais', 'success'],
    ['a_risque', 'À risque', 'warn'],
    ['en_retard', 'En retard', 'danger'],
    ['clos_en_retard', 'Clos en retard', 'danger'],
    ['sans_regle', 'Règle à valider', 'neutral'],
  ];

  it.each(cases)('signal %s : texte « %s », ton %s et icône (jamais la couleur seule)', (flag, label, tone) => {
    const { container } = render(<DeadlineBadge flag={flag} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass('badge', tone);
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('privilégie le libellé fourni par l’API', () => {
    render(<DeadlineBadge flag="en_retard" label="En retard (J+3)" />);
    expect(screen.getByText('En retard (J+3)')).toBeInTheDocument();
  });

  it('affiche un tiret sans signal', () => {
    render(<DeadlineBadge flag={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('affiche « Réponse envoyée » en vert avec icône', () => {
    const { container } = render(<StatusBadge status="reponse_envoyee" />);
    expect(screen.getByText('Réponse envoyée')).toHaveClass('success');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
