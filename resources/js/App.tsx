import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLicense } from './contexts/LicenseContext';
import { useSettings } from './contexts/SettingsContext';
import { SuperadminAuthProvider, useSuperadminAuth } from './contexts/SuperadminAuthContext';
import { useIdleLogout } from './lib/useIdleLogout';
import AppLayout from './components/AppLayout';
import SuperadminLayout from './components/SuperadminLayout';
import ForcedPasswordChangeScreen from './components/ForcedPasswordChangeScreen';
import LicenseBlockedScreen from './components/LicenseBlockedScreen';
import SplashScreen from './components/SplashScreen';
import Login from './pages/Login';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ImpersonateBridge from './pages/ImpersonateBridge';
import PlatformLoginPage from './pages/superadmin/PlatformLoginPage';
import PlatformDashboardPage from './pages/superadmin/DashboardPage';
import PressingsPage from './pages/superadmin/PressingsPage';
import PressingFormPage from './pages/superadmin/PressingFormPage';
import PressingDetailPage from './pages/superadmin/PressingDetailPage';
import PlatformUsersPage from './pages/superadmin/UsersPage';
import PlatformProfilePage from './pages/superadmin/ProfilePage';
import PlatformSettingsPage from './pages/superadmin/PlatformSettingsPage';
import PlatformAuditLogsPage from './pages/superadmin/AuditLogsPage';
import PlatformRolesPage from './pages/superadmin/RolesPage';
import PlatformPlansPage from './pages/superadmin/PlansPage';
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
import CashMovementDetailPage from './pages/cash/CashMovementDetailPage';
import InvoicesOutstandingPage from './pages/InvoicesOutstandingPage';
import SettingsPage from './pages/SettingsPage';
import BrandingSettingsPage from './pages/settings/BrandingSettingsPage';
import SecuritySettingsPage from './pages/settings/SecuritySettingsPage';
import OperationalSettingsPage from './pages/settings/OperationalSettingsPage';
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
import DailyReportPage from './pages/reports/DailyReportPage';
import DashboardPage from './pages/DashboardPage';
import NotificationsPage from './pages/NotificationsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SyncPage from './pages/SyncPage';

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

function SuperadminProtectedLayout() {
    const { user, loading } = useSuperadminAuth();

    if (loading) {
        return <SplashScreen />;
    }

    if (!user) {
        return <Navigate to="/superadmin/login" replace />;
    }

    return <SuperadminLayout />;
}

export default function App() {
    return (
        <BrowserRouter>
            <SuperadminAuthProvider>
                <Routes>
                    <Route path="/superadmin/login" element={<PlatformLoginPage />} />
                    <Route path="/superadmin" element={<SuperadminProtectedLayout />}>
                        <Route index element={<Navigate to="dashboard" replace />} />
                        <Route path="dashboard" element={<PlatformDashboardPage />} />
                        <Route path="pressings" element={<PressingsPage />} />
                        <Route path="pressings/new" element={<PressingFormPage />} />
                        <Route path="pressings/:id/edit" element={<PressingFormPage />} />
                        <Route path="pressings/:id" element={<PressingDetailPage />} />
                        <Route path="users" element={<PlatformUsersPage />} />
                        <Route path="roles" element={<PlatformRolesPage />} />
                        <Route path="plans" element={<PlatformPlansPage />} />
                        <Route path="audit-logs" element={<PlatformAuditLogsPage />} />
                        <Route path="settings" element={<PlatformSettingsPage />} />
                        <Route path="profile" element={<PlatformProfilePage />} />
                    </Route>

                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/impersonate" element={<ImpersonateBridge />} />
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
                    <Route path="/cash/movements/:id" element={<CashMovementDetailPage />} />
                    <Route path="/cash/closures/new" element={<CashClosureFormPage />} />
                    <Route path="/cash/closures/:id" element={<CashClosureDetail />} />
                    <Route path="/invoices/outstanding" element={<InvoicesOutstandingPage />} />
                    <Route path="/stock" element={<StockPage />} />
                    <Route path="/deliveries" element={<DeliveriesPage />} />
                    <Route path="/hr" element={<RhPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/kpi" element={<KpiPage />} />
                    <Route path="/reports/daily" element={<DailyReportPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/audit-logs" element={<AuditLogsPage />} />
                    <Route path="/synchronisation" element={<SyncPage />} />
                    <Route path="/license" element={<LicensePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/branding" element={<BrandingSettingsPage />} />
                    <Route path="/settings/security" element={<SecuritySettingsPage />} />
                    <Route path="/settings/operational" element={<OperationalSettingsPage />} />
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
            </SuperadminAuthProvider>
        </BrowserRouter>
    );
}
