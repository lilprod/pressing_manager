import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLicense } from './contexts/LicenseContext';
import { useSettings } from './contexts/SettingsContext';
import { useIdleLogout } from './lib/useIdleLogout';
import AppLayout from './components/AppLayout';
import ForcedPasswordChangeScreen from './components/ForcedPasswordChangeScreen';
import LicenseBlockedScreen from './components/LicenseBlockedScreen';
import SplashScreen from './components/SplashScreen';
import Login from './pages/Login';
import NewOrder from './pages/counter/NewOrder';
import OrdersList from './pages/counter/OrdersList';
import OrderDetail from './pages/counter/OrderDetail';
import TicketFacturePage from './pages/counter/TicketFacturePage';
import AtelierBoard from './pages/atelier/AtelierBoard';
import PickupsList from './pages/pickups/PickupsList';
import PickupProcessPage from './pages/pickups/PickupProcessPage';
import Scan from './pages/Scan';
import ClientsList from './pages/clients/ClientsList';
import ClientDetailPage from './pages/clients/ClientDetailPage';
import ClientFormPage from './pages/clients/ClientFormPage';
import LicensePage from './pages/LicensePage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import LoyaltyPage from './pages/LoyaltyPage';
import ServicesPage from './pages/ServicesPage';
import ServiceFormPage from './pages/services/ServiceFormPage';
import TreatmentTypesPage from './pages/services/TreatmentTypesPage';
import CashRegisterPage from './pages/cash/CashRegisterPage';
import CashMovementFormPage from './pages/cash/CashMovementFormPage';
import CashClosureFormPage from './pages/cash/CashClosureFormPage';
import CashClosureDetail from './pages/cash/CashClosureDetail';
import InvoicesOutstandingPage from './pages/InvoicesOutstandingPage';
import SettingsPage from './pages/SettingsPage';
import BrandingSettingsPage from './pages/settings/BrandingSettingsPage';
import SecuritySettingsPage from './pages/settings/SecuritySettingsPage';
import ProfilePage from './pages/ProfilePage';
import UsersPage from './pages/UsersPage';
import RolesPermissionsPage from './pages/RolesPermissionsPage';
import AgenciesPage from './pages/agencies/AgenciesPage';
import AgencyFormPage from './pages/agencies/AgencyFormPage';
import MultiAgencyOverviewPage from './pages/multiagency/MultiAgencyOverviewPage';
import MultiAgencyDetailPage from './pages/multiagency/MultiAgencyDetailPage';
import StockPage from './pages/StockPage';
import DeliveriesPage from './pages/DeliveriesPage';
import RhPage from './pages/RhPage';
import KpiPage from './pages/KpiPage';
import DashboardPage from './pages/DashboardPage';
import NotificationsPage from './pages/NotificationsPage';
import AuditLogsPage from './pages/AuditLogsPage';

function ProtectedLayout() {
    const { user, loading, logout } = useAuth();
    const { license, loading: licenseLoading } = useLicense();
    const { settings } = useSettings();

    useIdleLogout(settings?.session_timeout_minutes, logout, !!user);

    if (loading || licenseLoading) {
        return <SplashScreen />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Blocage total de l'application (sauf écran de renouvellement) une fois la
    // période de grâce dépassée — voir CheckLicenseStatus côté API.
    if (license?.status === 'expired') {
        return <LicenseBlockedScreen />;
    }

    // Compte créé par un administrateur (premier login) ou mot de passe arrivé à expiration :
    // bloque le reste de l'application tant que l'utilisateur n'a pas défini un nouveau mot de passe.
    if (user.must_change_password || user.password_expired) {
        return <ForcedPasswordChangeScreen expired={user.password_expired && !user.must_change_password} />;
    }

    return <AppLayout />;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedLayout />}>
                    <Route path="/" element={<NewOrder />} />
                    <Route path="/orders" element={<OrdersList />} />
                    <Route path="/orders/:id" element={<OrderDetail />} />
                    <Route path="/orders/:id/documents" element={<TicketFacturePage />} />
                    <Route path="/atelier" element={<AtelierBoard />} />
                    <Route path="/pickups" element={<PickupsList />} />
                    <Route path="/pickups/:orderId" element={<PickupProcessPage />} />
                    <Route path="/scan" element={<Scan />} />
                    <Route path="/clients" element={<ClientsList />} />
                    <Route path="/clients/new" element={<ClientFormPage />} />
                    <Route path="/clients/:id/edit" element={<ClientFormPage />} />
                    <Route path="/clients/:id" element={<ClientDetailPage />} />
                    <Route path="/subscriptions" element={<SubscriptionsPage />} />
                    <Route path="/loyalty" element={<LoyaltyPage />} />
                    <Route path="/services" element={<ServicesPage />} />
                    <Route path="/services/new" element={<ServiceFormPage />} />
                    <Route path="/services/treatment-types" element={<TreatmentTypesPage />} />
                    <Route path="/services/:id/edit" element={<ServiceFormPage />} />
                    <Route path="/cash" element={<CashRegisterPage />} />
                    <Route path="/cash/movements/new" element={<CashMovementFormPage />} />
                    <Route path="/cash/closures/new" element={<CashClosureFormPage />} />
                    <Route path="/cash/closures/:id" element={<CashClosureDetail />} />
                    <Route path="/invoices/outstanding" element={<InvoicesOutstandingPage />} />
                    <Route path="/stock" element={<StockPage />} />
                    <Route path="/deliveries" element={<DeliveriesPage />} />
                    <Route path="/hr" element={<RhPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/kpi" element={<KpiPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/audit-logs" element={<AuditLogsPage />} />
                    <Route path="/license" element={<LicensePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/branding" element={<BrandingSettingsPage />} />
                    <Route path="/settings/security" element={<SecuritySettingsPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/roles-permissions" element={<RolesPermissionsPage />} />
                    <Route path="/agencies" element={<AgenciesPage />} />
                    <Route path="/agencies/new" element={<AgencyFormPage />} />
                    <Route path="/agencies/:id/edit" element={<AgencyFormPage />} />
                    <Route path="/multi-agences" element={<MultiAgencyOverviewPage />} />
                    <Route path="/multi-agences/:id" element={<MultiAgencyDetailPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
