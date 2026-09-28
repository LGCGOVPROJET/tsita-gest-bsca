import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { formatDuration } from '@/lib/format';
import { RequireClient, RequireStaff } from '@/routes/guards';
import { ApiEventsBridge } from '@/routes/ApiEventsBridge';
import { apiEvents } from '@/api/client';
import { QrCode } from '@/components/ui/QrCode';
import { ReopenAction, type ComplaintOps } from '@/features/public/ComplaintActions';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import { makeUser, renderWithProviders } from './utils';

describe('Retry-After lisible (suivi public)', () => {
  it.each([
    [45, '45 s'],
    [60, '1 min'],
    [900, '15 min'],
    [3600, '1 h'],
    [5400, '1 h 30'],
    [86400, '24 h'],
    [null, 'quelques instants'],
  ])('%s s → « %s »', (s, label) => {
    expect(formatDuration(s as number | null)).toBe(label);
  });
});

describe('MFA imposée (SEC-01)', () => {
  it('la garde collaborateur force l’écran d’enrôlement', () => {
    renderWithProviders(
      <Routes>
        <Route path="/app/x" element={<RequireStaff><p>Interne</p></RequireStaff>} />
        <Route path="/securite/mfa" element={<p>Écran d’enrôlement</p>} />
      </Routes>,
      { user: makeUser(['complaints.view'], { role: 'conformite', mfa_enrollment_required: true }), route: '/app/x' },
    );
    expect(screen.getByText('Écran d’enrôlement')).toBeInTheDocument();
    expect(screen.queryByText('Interne')).not.toBeInTheDocument();
  });

  it('la garde client force aussi l’enrôlement', () => {
    renderWithProviders(
      <Routes>
        <Route path="/client" element={<RequireClient><p>Mes réclamations</p></RequireClient>} />
        <Route path="/securite/mfa" element={<p>Écran d’enrôlement</p>} />
      </Routes>,
      { user: makeUser([], { role: 'client', mfa_enrollment_required: true }), route: '/client' },
    );
    expect(screen.getByText('Écran d’enrôlement')).toBeInTheDocument();
  });

  it('un 403 mfa_enrollment_required redirige vers l’enrôlement', async () => {
    renderWithProviders(
      <>
        <ApiEventsBridge />
        <Routes>
          <Route path="/app/reclamations" element={<p>Liste</p>} />
          <Route path="/securite/mfa" element={<p>Écran d’enrôlement</p>} />
        </Routes>
      </>,
      { user: makeUser(['complaints.view']), route: '/app/reclamations' },
    );
    expect(screen.getByText('Liste')).toBeInTheDocument();
    act(() => {
      apiEvents.dispatchEvent(new CustomEvent('mfa-enrollment-required'));
    });
    await waitFor(() => expect(screen.getByText('Écran d’enrôlement')).toBeInTheDocument());
  });

  it('le QR code est généré localement en SVG accessible', () => {
    renderWithProviders(<QrCode value="otpauth://totp/TSITA:qualite@bsca.demo?secret=JBSWY3DPEHPK3PXP&issuer=TSITA" label="QR code à scanner" />);
    const svg = screen.getByRole('img', { name: 'QR code à scanner' });
    expect(svg.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(100);
  });
});

describe('SEC-24 — jeton de réinitialisation', () => {
  it('lit le jeton puis le retire de la barre d’adresse', async () => {
    window.history.replaceState(null, '', '/reinitialiser-mot-de-passe?token=secret-token&email=a%40b.cg');
    renderWithProviders(<ResetPasswordPage />, { route: '/reinitialiser-mot-de-passe' });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.getByRole('textbox', { name: /Adresse e-mail/ })).toHaveValue('a@b.cg');
    expect(screen.queryByText(/Lien incomplet/)).not.toBeInTheDocument();
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
  });
});

describe('Réouverture côté client', () => {
  it('la fenêtre et le nouveau code restent affichés même si can_reopen devient faux', async () => {
    const ops: ComplaintOps = {
      sendMessage: vi.fn(),
      upload: vi.fn(),
      reopen: vi.fn(async () => ({ reference: 'TG-BSCA-2026-000200', tracking_code: 'AB12CD34' })),
      refresh: vi.fn(async () => undefined),
    };
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<ReopenAction ops={ops} canReopen />);
    await user.click(screen.getByRole('button', { name: /réouverture/ }));
    await user.type(screen.getByLabelText(/Motif de la réouverture/), 'La réponse ne tient pas compte de mon relevé joint.');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('AB12CD34')).toBeInTheDocument();
    rerender(<ReopenAction ops={ops} canReopen={false} />);
    expect(screen.getByText('AB12CD34')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /demander une réouverture/ })).not.toBeInTheDocument();
  });
});
