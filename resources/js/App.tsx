import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import NewOrder from './pages/counter/NewOrder';
import OrdersList from './pages/counter/OrdersList';
import OrderDetail from './pages/counter/OrderDetail';
import Scan from './pages/Scan';
import ClientsList from './pages/clients/ClientsList';

function ProtectedLayout() {
    const { user, loading } = useAuth();

    if (loading) {
        return null;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
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
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
