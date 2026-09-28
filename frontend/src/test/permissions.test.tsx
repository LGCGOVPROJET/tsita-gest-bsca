import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { RequirePermission, RequireStaff } from '@/routes/guards';
import { Sidebar } from '@/components/layout/Sidebar';
import { can, canAccessPath, canAny, homePathFor, safeNext } from '@/lib/permissions';
import { makeUser, renderWithProviders } from './utils';

describe('garde de permissions', () => {
  it('ramène vers son espace un profil qui ouvre une page réservée (pas d’impasse 403)', () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/app/parametres"
          element={
            <RequirePermission anyOf={['admin.users']}>
              <p>Contenu admin</p>
            </RequirePermission>
          }
        />
        <Route path="/app/reclamations" element={<p>Liste des réclamations</p>} />
      </Routes>,
      { user: makeUser(['complaints.view']), route: '/app/parametres' },
    );
    expect(screen.getByText('Liste des réclamations')).toBeInTheDocument();
    expect(screen.queryByText('Contenu admin')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Accès non autorisé' })).not.toBeInTheDocument();
  });

  it('n’affiche la page 403 que si le profil n’a aucune page autorisée', () => {
    renderWithProviders(
      <RequirePermission anyOf={['admin.users']}>
        <p>Contenu admin</p>
      </RequirePermission>,
      { user: makeUser([]) },
    );
    expect(screen.getByRole('heading', { name: 'Accès non autorisé' })).toBeInTheDocument();
  });

  it('ne reprend une destination mémorisée après connexion que si elle est autorisée', () => {
    const admin = makeUser(['admin.users']);
    expect(canAccessPath(admin, '/app/tableau-de-bord')).toBe(false);
    expect(canAccessPath(admin, '/app/parametres?onglet=utilisateurs')).toBe(true);
    expect(canAccessPath(admin, '/app/securite')).toBe(true);
    const agent = makeUser(['complaints.view', 'dashboard.view']);
    expect(canAccessPath(agent, '/app/reclamations/12')).toBe(true);
    expect(canAccessPath(agent, '/app/administration')).toBe(false);
    expect(canAccessPath(makeUser([], { role: 'client' }), '/app/tableau-de-bord')).toBe(false);
    expect(canAccessPath(makeUser([], { role: 'client' }), '/client/TG-BSCA-2026-000018')).toBe(true);
  });

  it('affiche le contenu si au moins une permission est détenue', () => {
    renderWithProviders(
      <RequirePermission anyOf={['solutions.propose', 'solutions.approve_n1']}>
        <p>Solutions</p>
      </RequirePermission>,
      { user: makeUser(['solutions.approve_n1']) },
    );
    expect(screen.getByText('Solutions')).toBeInTheDocument();
  });

  it('redirige un visiteur non connecté vers la connexion en conservant la destination', () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/app/delais"
          element={
            <RequireStaff>
              <p>Délais</p>
            </RequireStaff>
          }
        />
        <Route path="/connexion" element={<p>Page de connexion</p>} />
      </Routes>,
      { user: null, route: '/app/delais' },
    );
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });

  it('renvoie un client vers son espace', () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/app/x"
          element={
            <RequireStaff>
              <p>Interne</p>
            </RequireStaff>
          }
        />
        <Route path="/client" element={<p>Espace client</p>} />
      </Routes>,
      { user: makeUser([], { role: 'client', role_label: 'Client' }), route: '/app/x' },
    );
    expect(screen.getByText('Espace client')).toBeInTheDocument();
  });
});

describe('barre latérale filtrée', () => {
  it('ne montre que les rubriques autorisées', () => {
    renderWithProviders(<Sidebar />, { user: makeUser(['complaints.view', 'deadlines.view']), route: '/app/reclamations' });
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /Réclamations/ })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /Délais et alertes/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Tableau de bord/ })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Paramètres/ })).not.toBeInTheDocument();
    // L'espace client public reste accessible.
    expect(within(nav).getByRole('link', { name: /Déposer une demande/ })).toBeInTheDocument();
  });

  it('place les rubriques d’administration autorisées dans la barre latérale', () => {
    renderWithProviders(<Sidebar />, { user: makeUser(['admin.referentials'], { role: 'admin' }) });
    expect(screen.getByRole('link', { name: /^Administration/ })).toHaveAttribute('href', '/app/administration');
    expect(screen.getByRole('link', { name: /Agences/ })).toHaveAttribute('href', '/app/parametres?onglet=agences');
    expect(screen.getByRole('link', { name: /Modèles de réponse/ })).toBeInTheDocument();
    // Rubriques d'autres permissions : absentes.
    expect(screen.queryByRole('link', { name: /Utilisateurs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Imports historiques/ })).not.toBeInTheDocument();
  });

  it('replie une catégorie au clic, sauf celle de la page ouverte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />, { user: makeUser(['admin.referentials'], { role: 'admin' }), route: '/app/parametres?onglet=agences' });
    const referentiels = screen.getByRole('button', { name: /Référentiels/ });
    expect(referentiels).toBeDisabled();
    expect(referentiels).toHaveAttribute('aria-expanded', 'true');
    const compte = screen.getByRole('button', { name: /Mon compte/ });
    await user.click(compte);
    expect(compte).toHaveAttribute('aria-expanded', 'false');
    await user.click(compte);
    expect(compte).toHaveAttribute('aria-expanded', 'true');
  });

  it('met en évidence la rubrique ouverte', () => {
    renderWithProviders(<Sidebar />, { user: makeUser(['admin.referentials'], { role: 'admin' }), route: '/app/parametres?onglet=produits' });
    expect(screen.getByRole('link', { name: /Produits/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Agences/ })).not.toHaveAttribute('aria-current');
  });
});

describe('helpers de permissions', () => {
  it('can / canAny', () => {
    const u = makeUser(['complaints.view', 'complaints.export']);
    expect(can(u, 'complaints.view', 'complaints.export')).toBe(true);
    expect(can(u, 'complaints.view', 'admin.users')).toBe(false);
    expect(canAny(u, 'admin.users', 'complaints.export')).toBe(true);
    expect(can(null, 'complaints.view')).toBe(false);
  });

  it('page d’accueil selon le profil', () => {
    expect(homePathFor(makeUser(['dashboard.view', 'complaints.view']))).toBe('/app/tableau-de-bord');
    expect(homePathFor(makeUser(['admin.users']))).toBe('/app/administration');
    expect(homePathFor(makeUser([], { role: 'client' }))).toBe('/client');
  });

  it('refuse les redirections ouvertes', () => {
    expect(safeNext('/app/delais')).toBe('/app/delais');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('/\\evil')).toBeNull();
  });
});
