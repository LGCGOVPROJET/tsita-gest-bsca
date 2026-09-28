import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionBadge, InternalBadge, StatusBadge } from '@/components/ui/Badge';
import { InfoTip } from '@/components/ui/Tooltip';
import { ActionModal } from '@/features/complaint/ActionModal';
import { formatRatio } from '@/lib/format';
import { CLIENT_STATUS_OF } from '@/lib/labels';

describe('Finition UX — badges', () => {
  it('marqueur « Interne » : ton ambre, cadenas et texte', () => {
    const { container } = render(<InternalBadge />);
    expect(screen.getByText('Interne')).toHaveClass('badge', 'internal');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('décision de fond : badge distinct, annoncé comme « Décision »', () => {
    render(<DecisionBadge decision="non_fondee" />);
    const badge = screen.getByText(/Non fondée/);
    expect(badge).toHaveAttribute('title', expect.stringContaining('Décision de fond'));
    expect(badge.textContent).toContain('Décision :');
  });

  it('décision absente : « Décision à déterminer »', () => {
    render(<DecisionBadge decision={null} />);
    expect(screen.getByText('Décision à déterminer')).toBeInTheDocument();
  });

  it('« Réouvert » utilise la couleur fonctionnelle danger (pas le rouge de marque)', () => {
    render(<StatusBadge status="reouvert" />);
    expect(screen.getByText('Réouvert')).toHaveClass('danger');
  });
});

describe('Finition UX — indicateurs', () => {
  it('taux avec numérateur et dénominateur : « 71 / 128 · 55,5 % »', () => {
    expect(formatRatio(71, 128, 55.5).replace(/\u202f|\u00a0/g, ' ')).toBe('71 / 128 · 55,5 %');
    expect(formatRatio(0, 0, null)).toContain('0 / 0');
    expect(formatRatio(null, 10)).toBe('—');
  });

  it('la définition d’une infobulle reste reliée par aria-describedby, même fermée', () => {
    render(<InfoTip label="Définition : Reçues">Références uniques reçues dans la période.</InfoTip>);
    const btn = screen.getByRole('button', { name: 'Définition : Reçues' });
    const id = btn.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toContain('Références uniques');
  });

  it('statut client dérivé du statut interne (§6)', () => {
    expect(CLIENT_STATUS_OF.attente_information).toBe('Information demandée');
    expect(CLIENT_STATUS_OF.a_valider).toBe("En cours d'analyse");
  });
});

describe('Finition UX — modale d’action', () => {
  it('affiche le résumé de l’effet et exige une confirmation avant une action irréversible', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ActionModal
        open
        onClose={() => undefined}
        title="Envoyer la réponse définitive"
        submitLabel="Envoyer au client"
        requireReason={false}
        onSubmit={onSubmit}
        effect={[<>Le client verra : « Réponse envoyée ».</>]}
        confirm={{ title: 'Envoyer la réponse au client ?', body: <p>Envoi définitif.</p>, confirmLabel: "Confirmer l'envoi" }}
      />,
    );
    expect(screen.getByText(/Le client verra/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer au client' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Envoyer la réponse au client ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Confirmer l'envoi" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('refuse un motif trop court', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ActionModal open onClose={() => undefined} title="Changer l'état" submitLabel="Confirmer" onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/motif est obligatoire/)).toBeInTheDocument();
  });
});
