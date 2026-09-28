import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { LicenseProvider } from './contexts/LicenseContext';
import { SettingsProvider } from './contexts/SettingsContext';
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
                <SettingsProvider>
                    <AuthProvider>
                        <LicenseProvider>
                            <App />
                        </LicenseProvider>
                    </AuthProvider>
                </SettingsProvider>
            </ThemeProvider>
        </I18nProvider>
    </StrictMode>,
);
