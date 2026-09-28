import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { PageSkeleton } from '@/components/layout/PageSkeleton';
import { ApiEventsBridge } from '@/routes/ApiEventsBridge';
import { RequireClient, RequirePermission, RequireStaff } from '@/routes/guards';
import { useAuth } from '@/lib/auth-context';
import { homePathFor, ADMIN_PERMISSIONS, QUALITY_PERMISSIONS, SOLUTION_PERMISSIONS } from '@/lib/permissions';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ComplaintsPage = lazy(() => import('@/pages/ComplaintsPage'));
const ComplaintNewPage = lazy(() => import('@/pages/ComplaintNewPage'));
const ComplaintDetailPage = lazy(() => import('@/pages/ComplaintDetailPage'));
const DeadlinesPage = lazy(() => import('@/pages/DeadlinesPage'));
const SolutionsPage = lazy(() => import('@/pages/SolutionsPage'));
const QualityPage = lazy(() => import('@/pages/QualityPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const PublicFilePage = lazy(() => import('@/pages/PublicFilePage'));
const TrackPage = lazy(() => import('@/pages/TrackPage'));
const ClientHomePage = lazy(() => import('@/pages/ClientHomePage'));
const ClientComplaintPage = lazy(() => import('@/pages/ClientComplaintPage'));
const MfaEnrollmentPage = lazy(() => import('@/pages/MfaEnrollmentPage'));
const AccountSecurityPage = lazy(() => import('@/pages/AccountSecurityPage'));

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  return <Navigate to={homePathFor(user)} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Accueil public : page autonome (en-tête et pied de page propres, maquette Accueil V1) */}
      <Route
        path="/"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <HomePage />
          </Suspense>
        }
      />
      <Route
        path="/connexion"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/reinitialiser-mot-de-passe"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <ResetPasswordPage />
          </Suspense>
        }
      />

      <Route
        path="/securite/mfa"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <MfaEnrollmentPage />
          </Suspense>
        }
      />

      {/* Espace collaborateur */}
      <Route
        path="/app"
        element={
          <RequireStaff>
            <AppShell />
          </RequireStaff>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route
          path="tableau-de-bord"
          element={
            <RequirePermission anyOf={['dashboard.view']}>
              <DashboardPage />
            </RequirePermission>
          }
        />
        <Route
          path="reclamations"
          element={
            <RequirePermission anyOf={['complaints.view']}>
              <ComplaintsPage />
            </RequirePermission>
          }
        />
        <Route
          path="reclamations/nouvelle"
          element={
            <RequirePermission anyOf={['complaints.create']}>
              <ComplaintNewPage />
            </RequirePermission>
          }
        />
        <Route
          path="reclamations/:id"
          element={
            <RequirePermission anyOf={['complaints.view']}>
              <ComplaintDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="delais"
          element={
            <RequirePermission anyOf={['deadlines.view']}>
              <DeadlinesPage />
            </RequirePermission>
          }
        />
        <Route
          path="solutions"
          element={
            <RequirePermission anyOf={SOLUTION_PERMISSIONS}>
              <SolutionsPage />
            </RequirePermission>
          }
        />
        <Route
          path="qualite"
          element={
            <RequirePermission anyOf={QUALITY_PERMISSIONS}>
              <QualityPage />
            </RequirePermission>
          }
        />
        <Route
          path="rapports"
          element={
            <RequirePermission anyOf={['reports.view']}>
              <ReportsPage />
            </RequirePermission>
          }
        />
        <Route
          path="administration"
          element={
            <RequirePermission anyOf={ADMIN_PERMISSIONS}>
              <AdminDashboardPage />
            </RequirePermission>
          }
        />
        <Route
          path="parametres"
          element={
            <RequirePermission anyOf={ADMIN_PERMISSIONS}>
              <SettingsPage />
            </RequirePermission>
          }
        />
        <Route path="securite" element={<AccountSecurityPage />} />
        <Route path="securite/mfa" element={<Navigate to="/app/securite" replace />} />
        <Route path="interdit" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage inApp />} />
      </Route>

      {/* Portail client */}
      <Route element={<ClientLayout />}>
        <Route path="/deposer" element={<PublicFilePage />} />
        <Route path="/suivi" element={<TrackPage />} />
        <Route
          path="/client"
          element={
            <RequireClient>
              <ClientHomePage />
            </RequireClient>
          }
        />
        <Route
          path="/client/:reference"
          element={
            <RequireClient>
              <ClientComplaintPage />
            </RequireClient>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ApiEventsBridge />
        <AppRoutes />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
