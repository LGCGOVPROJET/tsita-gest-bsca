import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { FilingForm } from '@/features/public/FilingForm';
import { renderWithProviders } from './utils';

const createComplaint = vi.fn();

vi.mock('@/api/endpoints', () => ({
  publicApi: {
    referentials: vi.fn(async () => ({
      categories: [{ id: 3, label: 'Cartes et paiements' }],
      products: [{ id: 7, label: 'Carte bancaire' }],
      channels_reply: ['courriel', 'courrier', 'telephone'],
      agencies: [{ id: 1, name: 'Brazzaville Centre' }],
    })),
    // Le mock renvoie { error } plutôt qu'une promesse rejetée (le suivi interne de vi.fn
    // produirait sinon un rejet non géré parasite).
    createComplaint: async (fd: FormData) => {
      const r = await createComplaint(fd);
      if (r && typeof r === 'object' && 'error' in r) throw r.error;
      return r;
    },
  },
}));

async function fillUntilReview(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nom et prénom/), 'Jeanne Mabiala');
  await user.type(screen.getByLabelText(/Adresse e-mail/), 'jeanne@exemple.cg');
  await user.click(screen.getByRole('button', { name: /Continuer/ }));

  await screen.findByRole('heading', { name: /Étape 2 sur 5/ });
  await user.click(await screen.findByRole('radio', { name: /Carte bancaire/ }));
  await user.type(screen.getByLabelText(/Objet de votre réclamation/), 'Paiement débité deux fois');
  await user.click(screen.getByRole('button', { name: /Continuer/ }));

  await screen.findByRole('heading', { name: /Étape 3 sur 5/ });
  await user.type(screen.getByLabelText(/Expliquez ce qui s'est passé/), 'Mon paiement du 12 septembre a été débité deux fois sur mon compte.');
  await user.click(screen.getByRole('button', { name: /Continuer/ }));

  await screen.findByRole('heading', { name: /Étape 4 sur 5/ });
  await user.click(screen.getByRole('button', { name: /Continuer/ }));
  await screen.findByRole('heading', { name: /Étape 5 sur 5/ });
}

describe('Formulaire de dépôt multi-étapes', () => {
  beforeEach(() => {
    createComplaint.mockReset();
  });

  it('bloque le passage à l’étape suivante tant que l’identité est invalide', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FilingForm />);
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(await screen.findByText('Indiquez votre nom et prénom.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Étape 1 sur 5/ })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Étape 1 sur 5');
  });

  it('exige le consentement, envoie le dépôt et affiche référence + code de suivi', async () => {
    createComplaint.mockResolvedValue({
      reference: 'TG-BSCA-2026-000245',
      tracking_code: 'K7P2QX9M',
      received_at: '2026-09-28T09:15:00+01:00',
      acknowledgment_due_at: '2026-10-12T23:59:59+01:00',
      final_response_due_at: '2026-11-12T23:59:59+01:00',
      rule_is_demo: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<FilingForm />);
    await fillUntilReview(user);

    // Récapitulatif
    expect(screen.getByText('Paiement débité deux fois')).toBeInTheDocument();
    expect(screen.getByText(/Montant : Inconnu/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Envoyer ma réclamation/ }));
    expect(await screen.findByText('Votre accord est nécessaire pour traiter votre réclamation.')).toBeInTheDocument();
    expect(createComplaint).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Envoyer ma réclamation/ }));

    expect(await screen.findByText('TG-BSCA-2026-000245')).toBeInTheDocument();
    expect(screen.getByText('K7P2QX9M')).toBeInTheDocument();
    expect(screen.getByText(/n'est affiché qu'une seule fois/)).toBeInTheDocument();
    expect(screen.getByText(/Règle de démonstration/)).toBeInTheDocument();

    const fd = createComplaint.mock.calls[0]![0] as FormData;
    expect(fd.get('full_name')).toBe('Jeanne Mabiala');
    expect(fd.get('product_id')).toBe('7');
    expect(fd.get('consent')).toBe('1');
    expect(fd.get('amount')).toBeNull(); // montant inconnu : non transmis
  });

  it('en cas d’erreur 422, revient à l’étape concernée en conservant les saisies', async () => {
    const err = new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 422,
      statusText: 'Unprocessable',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { message: 'Données invalides', errors: { email: ['Cette adresse e-mail est refusée.'] } },
    });
    createComplaint.mockResolvedValue({ error: err });
    const user = userEvent.setup();
    renderWithProviders(<FilingForm />);
    await fillUntilReview(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Envoyer ma réclamation/ }));

    expect(await screen.findByRole('heading', { name: /Étape 1 sur 5/ })).toBeInTheDocument();
    expect(screen.getByText('Cette adresse e-mail est refusée.')).toBeInTheDocument();
    expect(screen.getByText(/Vos données saisies sont conservées/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom et prénom/)).toHaveValue('Jeanne Mabiala');
  });
  it('n’envoie qu’une seule réclamation sur un double clic, puis permet d’en déposer une autre', async () => {
    let resolve!: (v: unknown) => void;
    createComplaint.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderWithProviders(<FilingForm />);
    await fillUntilReview(user);
    await user.click(screen.getByRole('checkbox'));
    const send = screen.getByRole('button', { name: /Envoyer ma réclamation/ });
    await user.click(send);
    await user.click(send);
    await waitFor(() => expect(screen.getByRole('button', { name: /Envoi en cours/ })).toBeDisabled());
    resolve({
      reference: 'TG-BSCA-2026-000246',
      tracking_code: 'Q2W3E4R5',
      received_at: '2026-09-28T09:15:00+01:00',
      acknowledgment_due_at: null,
      final_response_due_at: null,
      rule_is_demo: false,
    });
    expect(await screen.findByText('TG-BSCA-2026-000246')).toBeInTheDocument();
    expect(createComplaint).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Toutes les étapes sont terminées');

    await user.click(screen.getByRole('button', { name: /Déposer une autre réclamation/ }));
    expect(await screen.findByRole('heading', { name: /Étape 1 sur 5/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom et prénom/)).toHaveValue('');
  });

  it('accepte un téléphone au format du serveur et affiche une aide courte en version compacte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FilingForm compact />);
    expect(screen.queryByRole('complementary', { name: 'Aide' })).not.toBeInTheDocument();
    expect(screen.getByText(/Elles nous permettent de vous identifier/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Nom et prénom/), 'Jeanne Mabiala');
    await user.type(screen.getByLabelText(/Adresse e-mail/), 'jeanne@exemple.cg');
    await user.type(screen.getByRole('textbox', { name: /Téléphone/ }), '(+242) 06-000-00-00');
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(await screen.findByRole('heading', { name: /Étape 2 sur 5/ })).toBeInTheDocument();
  });
});
