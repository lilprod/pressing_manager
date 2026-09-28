import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLicense } from './contexts/LicenseContext';
import AppLayout from './components/AppLayout';
import LicenseBlockedScreen from './components/LicenseBlockedScreen';
import SplashScreen from './components/SplashScreen';
import Login from './pages/Login';
import NewOrder from './pages/counter/NewOrder';
import OrdersList from './pages/counter/OrdersList';
import OrderDetail from './pages/counter/OrderDetail';
import Scan from './pages/Scan';
import ClientsList from './pages/clients/ClientsList';
import LicensePage from './pages/LicensePage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import LoyaltyPage from './pages/LoyaltyPage';
import InvoicesOutstandingPage from './pages/InvoicesOutstandingPage';
import SettingsPage from './pages/SettingsPage';
import StockPage from './pages/StockPage';
import DeliveriesPage from './pages/DeliveriesPage';
import RhPage from './pages/RhPage';
import KpiPage from './pages/KpiPage';
import NotificationsPage from './pages/NotificationsPage';

function ProtectedLayout() {
    const { user, loading } = useAuth();
    const { license, loading: licenseLoading } = useLicense();

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
                    <Route path="/scan" element={<Scan />} />
                    <Route path="/clients" element={<ClientsList />} />
                    <Route path="/subscriptions" element={<SubscriptionsPage />} />
                    <Route path="/loyalty" element={<LoyaltyPage />} />
                    <Route path="/invoices/outstanding" element={<InvoicesOutstandingPage />} />
                    <Route path="/stock" element={<StockPage />} />
                    <Route path="/deliveries" element={<DeliveriesPage />} />
                    <Route path="/hr" element={<RhPage />} />
                    <Route path="/kpi" element={<KpiPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/license" element={<LicensePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
