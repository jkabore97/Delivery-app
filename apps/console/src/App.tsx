import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { DashboardProvider } from './hooks/DashboardContext';
import { RealtimeProvider, type RealtimeBus } from './realtime/RealtimeContext';
import { AuditPage } from './pages/AuditPage';
import { CashPage } from './pages/CashPage';
import { DriverDetailPage } from './pages/DriverDetailPage';
import { DriversPage, KycQueuePage } from './pages/DriversPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { LivePage } from './pages/LivePage';
import { LoginPage } from './pages/LoginPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { PricingPage } from './pages/PricingPage';
import { ClientsPage, SellersPage, StaffPage } from './pages/UsersPage';

function Protected({ children, socketUrl, busOverride }: { children: ReactNode; socketUrl: string; busOverride?: RealtimeBus }) {
  const { token, logout } = useAuth();
  if (!token) return <Navigate to="/connexion" replace />;
  return (
    <RealtimeProvider
      url={socketUrl}
      token={token}
      busOverride={busOverride}
      onAuthError={(code) =>
        logout(
          code === 'ACCOUNT_SUSPENDED'
            ? 'Votre compte est suspendu. Contactez un administrateur.'
            : 'Votre session a expiré. Reconnectez-vous.',
        )
      }
    >
      <DashboardProvider>{children}</DashboardProvider>
    </RealtimeProvider>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>Page introuvable</h1>
      <Link to="/">Retour à la carte en direct</Link>
    </div>
  );
}

export function App({ socketUrl, busOverride }: { socketUrl: string; busOverride?: RealtimeBus }) {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route
        element={
          <Protected socketUrl={socketUrl} busOverride={busOverride}>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<LivePage />} />
        <Route path="courses" element={<OrdersPage />} />
        <Route path="courses/:id" element={<OrderDetailPage />} />
        <Route path="livreurs" element={<DriversPage />} />
        <Route path="livreurs/:id" element={<DriverDetailPage />} />
        <Route path="kyc" element={<KycQueuePage />} />
        <Route path="kyc/:id" element={<DriverDetailPage />} />
        <Route path="vendeurs" element={<SellersPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="caisse" element={<CashPage />} />
        <Route path="tarifs" element={<PricingPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="equipe" element={<StaffPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
