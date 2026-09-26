import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { hasPermission } from '../lib/permissions';
import LicenseBanner from './LicenseBanner';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
        isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700'
    }`;

export default function AppLayout() {
    const { user, agencies, activeAgencyId, setActiveAgencyId, logout } = useAuth();
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();
    const online = useOnlineStatus();

    const isGlobal = user?.agency_id === null;

    return (
        <div className="min-h-screen">
            <a href="#main-content" className="skip-link">
                {t('a11y.skipToContent')}
            </a>

            {!online && (
                <div role="status" className="bg-amber-700 px-4 py-2 text-center text-sm font-medium text-white">
                    {t('common.offline')}
                </div>
            )}

            <LicenseBanner />

            <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="mx-auto flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="font-semibold">{t('app.title')}</span>

                    <nav aria-label="Navigation principale" className="flex flex-wrap gap-1">
                        <NavLink to="/" className={navLinkClass}>
                            {t('nav.newOrder')}
                        </NavLink>
                        <NavLink to="/orders" className={navLinkClass}>
                            {t('nav.orders')}
                        </NavLink>
                        <NavLink to="/scan" className={navLinkClass}>
                            {t('nav.scan')}
                        </NavLink>
                        {hasPermission(user, 'clients.manage') && (
                            <NavLink to="/clients" className={navLinkClass}>
                                {t('nav.clients')}
                            </NavLink>
                        )}
                        {hasPermission(user, 'subscriptions.manage') && (
                            <NavLink to="/subscriptions" className={navLinkClass}>
                                {t('subscription.title')}
                            </NavLink>
                        )}
                        {hasPermission(user, 'licenses.manage') && (
                            <NavLink to="/license" className={navLinkClass}>
                                {t('nav.license')}
                            </NavLink>
                        )}
                    </nav>

                    <div className="ml-auto flex items-center gap-2">
                        {isGlobal && (
                            <label className="flex items-center gap-1 text-sm">
                                <span className="sr-only">{t('nav.agency')}</span>
                                <select
                                    value={activeAgencyId ?? ''}
                                    onChange={(e) => setActiveAgencyId(e.target.value ? Number(e.target.value) : null)}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                                >
                                    <option value="">{t('nav.allAgencies')}</option>
                                    {agencies.map((agency) => (
                                        <option key={agency.id} value={agency.id}>
                                            {agency.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <button
                            type="button"
                            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
                            aria-label={t('lang.toggle')}
                            className="rounded-md px-2 py-1 text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                            {lang === 'fr' ? 'FR' : 'EN'}
                        </button>

                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={t('theme.toggle')}
                            className="rounded-md px-2 py-1 text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>

                        <button
                            type="button"
                            onClick={() => void logout()}
                            className="rounded-md px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                        >
                            {t('nav.logout')}
                        </button>
                    </div>
                </div>
            </header>

            <main id="main-content" className="mx-auto max-w-5xl px-4 py-6">
                <Outlet />
            </main>
        </div>
    );
}
