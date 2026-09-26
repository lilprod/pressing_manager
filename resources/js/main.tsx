import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './lib/sync';

const root = document.getElementById('root');

if (!root) {
    throw new Error('#root introuvable');
}

createRoot(root).render(
    <StrictMode>
        <I18nProvider>
            <ThemeProvider>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </ThemeProvider>
        </I18nProvider>
    </StrictMode>,
);
