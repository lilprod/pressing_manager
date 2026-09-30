import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    Award,
    Bell,
    Boxes,
    Building2,
    CircleDollarSign,
    ClipboardList,
    Crown,
    KeyRound,
    Languages,
    LogOut,
    Menu,
    Moon,
    ScanLine,
    Settings as SettingsIcon,
    Shirt,
    ShieldCheck,
    ShoppingBag,
    Sun,
    Truck,
    UsersRound,
    Users,
    WifiOff,
    LayoutDashboard,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { hasPermission } from '../lib/permissions';
import LicenseBanner from './LicenseBanner';
import PasswordExpiryBanner from './PasswordExpiryBanner';
import BrandMark from './BrandMark';
import { Avatar } from './ui/PageHeader';
import { cx, iconButton } from './ui/styles';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-150',
        isActive
            ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-400/15 dark:text-brand-200 dark:ring-brand-400/20'
            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
    );

function NavItem({ to, icon: Icon, label, end, onClick }: { to: string; icon: LucideIcon; label: string; end?: boolean; onClick?: () => void }) {
    return (
        <NavLink to={to} end={end} className={navLinkClass} onClick={onClick}>
            <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            <span className="truncate">{label}</span>
        </NavLink>
    );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
            {children}
        </div>
    );
}

function useSidebarSections(onNavigate?: () => void) {
    const { user } = useAuth();
    const { t } = useI18n();

    return (
        <>
            <NavSection label={t('nav.section.counter')}>
                <NavItem to="/" end icon={ShoppingBag} label={t('nav.newOrder')} onClick={onNavigate} />
                <NavItem to="/orders" icon={ClipboardList} label={t('nav.orders')} onClick={onNavigate} />
                <NavItem to="/scan" icon={ScanLine} label={t('nav.scan')} onClick={onNavigate} />
                {(hasPermission(user, 'deliveries.manage') || hasPermission(user, 'deliveries.fulfill')) && (
                    <NavItem to="/deliveries" icon={Truck} label={t('nav.deliveries')} onClick={onNavigate} />
                )}
            </NavSection>

            {(hasPermission(user, 'clients.manage') || hasPermission(user, 'subscriptions.manage')) && (
                <NavSection label={t('nav.section.clients')}>
                    {hasPermission(user, 'clients.manage') && <NavItem to="/clients" icon={Users} label={t('nav.clients')} onClick={onNavigate} />}
                    {hasPermission(user, 'subscriptions.manage') && (
                        <NavItem to="/subscriptions" icon={Crown} label={t('subscription.title')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'clients.manage') && <NavItem to="/loyalty" icon={Award} label={t('loyalty.title')} onClick={onNavigate} />}
                </NavSection>
            )}

            {(hasPermission(user, 'services.manage') ||
                hasPermission(user, 'stocks.manage') ||
                hasPermission(user, 'hr.manage') ||
                hasPermission(user, 'hr.clock') ||
                hasPermission(user, 'users.manage')) && (
                <NavSection label={t('nav.section.resources')}>
                    {hasPermission(user, 'services.manage') && <NavItem to="/services" icon={Shirt} label={t('nav.services')} onClick={onNavigate} />}
                    {hasPermission(user, 'stocks.manage') && <NavItem to="/stock" icon={Boxes} label={t('nav.stock')} onClick={onNavigate} />}
                    {(hasPermission(user, 'hr.manage') || hasPermission(user, 'hr.clock')) && (
                        <NavItem to="/hr" icon={UsersRound} label={t('nav.hr')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'users.manage') && <NavItem to="/users" icon={UsersRound} label={t('users.title')} onClick={onNavigate} />}
                    {hasPermission(user, 'users.manage') && (
                        <NavItem to="/roles-permissions" icon={ShieldCheck} label={t('rbac.title')} onClick={onNavigate} />
                    )}
                </NavSection>
            )}

            {(hasPermission(user, 'invoices.manage') ||
                hasPermission(user, 'reports.view') ||
                hasPermission(user, 'notifications.manage') ||
                hasPermission(user, 'licenses.manage') ||
                hasPermission(user, 'agencies.manage')) && (
                <NavSection label={t('nav.section.insights')}>
                    {hasPermission(user, 'invoices.manage') && (
                        <NavItem to="/invoices/outstanding" icon={CircleDollarSign} label={t('invoice.outstandingTitle')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'reports.view') && <NavItem to="/kpi" icon={LayoutDashboard} label={t('nav.kpi')} onClick={onNavigate} />}
                    {hasPermission(user, 'notifications.manage') && (
                        <NavItem to="/notifications" icon={Bell} label={t('nav.notifications')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'licenses.manage') && <NavItem to="/license" icon={KeyRound} label={t('nav.license')} onClick={onNavigate} />}
                    {hasPermission(user, 'agencies.manage') && (
                        <NavItem to="/settings" icon={SettingsIcon} label={t('settings.title')} onClick={onNavigate} />
                    )}
                </NavSection>
            )}
        </>
    );
}

export default function AppLayout() {
    const { user, agencies, activeAgencyId, setActiveAgencyId, logout } = useAuth();
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();
    const online = useOnlineStatus();
    const location = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => setMobileNavOpen(false), [location.pathname]);

    const isGlobal = user?.agency_id === null;
    const [firstName, ...rest] = (user?.name ?? '').split(' ');
    const lastName = rest[rest.length - 1];

    const sidebarSections = useSidebarSections();
    const mobileSidebarSections = useSidebarSections(() => setMobileNavOpen(false));

    return (
        <div className="flex min-h-screen">
            <a href="#main-content" className="skip-link">
                {t('a11y.skipToContent')}
            </a>

            {/* Sidebar — desktop */}
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-200/80 bg-white lg:flex dark:border-ink-800 dark:bg-ink-950">
                <Link to="/" className="flex h-16 shrink-0 items-center px-5" aria-label={t('app.title')}>
                    <BrandMark />
                </Link>
                <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 pb-4">
                    {sidebarSections}
                </nav>
            </aside>

            {/* Sidebar — mobile overlay */}
            {mobileNavOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="fixed inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
                    <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-ink-950">
                        <div className="flex h-16 shrink-0 items-center justify-between px-4">
                            <Link to="/" aria-label={t('app.title')}>
                                <BrandMark />
                            </Link>
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen(false)}
                                aria-label={t('common.close')}
                                className={iconButton}
                            >
                                <X aria-hidden="true" className="h-5 w-5" />
                            </button>
                        </div>
                        <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 pb-4">
                            {mobileSidebarSections}
                        </nav>
                    </aside>
                </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                {!online && (
                    <div role="status" className="flex items-center justify-center gap-2 bg-amber-800 px-4 py-2 text-center text-sm font-medium text-white">
                        <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
                        {t('common.offline')}
                    </div>
                )}

                <LicenseBanner />
                <PasswordExpiryBanner />

                <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/85">
                    <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label={t('nav.openMenu')}
                            className={cx(iconButton, 'lg:hidden')}
                        >
                            <Menu aria-hidden="true" className="h-5 w-5" />
                        </button>

                        <Link to="/" className="shrink-0 rounded-xl lg:hidden" aria-label={t('app.title')}>
                            <BrandMark collapse />
                        </Link>

                        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
                            {isGlobal && (
                                <label className="relative flex items-center">
                                    <span className="sr-only">{t('nav.agency')}</span>
                                    <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-ink-600 dark:text-ink-350" />
                                    <select
                                        value={activeAgencyId ?? ''}
                                        onChange={(e) => setActiveAgencyId(e.target.value ? Number(e.target.value) : null)}
                                        className="h-10 max-w-[9.5rem] rounded-xl border border-ink-400 bg-white pl-9 pr-8 text-sm font-medium text-ink-800 transition hover:border-ink-500 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:max-w-[14rem] dark:border-ink-500 dark:bg-ink-900 dark:text-ink-100"
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
                                className={cx(iconButton, 'w-auto gap-1.5 px-2.5 text-xs font-bold')}
                            >
                                <Languages aria-hidden="true" className="h-[18px] w-[18px]" />
                                {lang === 'fr' ? 'FR' : 'EN'}
                            </button>

                            <button type="button" onClick={toggleTheme} aria-label={t('theme.toggle')} className={iconButton}>
                                {theme === 'dark' ? <Sun aria-hidden="true" className="h-[18px] w-[18px]" /> : <Moon aria-hidden="true" className="h-[18px] w-[18px]" />}
                            </button>

                            {user && (
                                <Link
                                    to="/profile"
                                    className="ml-1 hidden items-center gap-2.5 rounded-xl border-l border-ink-200 pl-3 transition hover:bg-ink-100 md:flex dark:border-ink-800 dark:hover:bg-ink-800"
                                >
                                    <Avatar firstName={firstName} lastName={lastName} photoUrl={user.photo_url} size="sm" />
                                    <div className="hidden max-w-[12rem] leading-tight lg:block">
                                        <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{user.name}</p>
                                        <p className="truncate text-xs text-ink-600 dark:text-ink-350">{user.agency?.name ?? user.role?.name}</p>
                                    </div>
                                </Link>
                            )}

                            <button
                                type="button"
                                onClick={() => void logout()}
                                aria-label={t('nav.logout')}
                                title={t('nav.logout')}
                                className={cx(iconButton, 'text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10 dark:hover:text-red-200')}
                            >
                                <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                    </div>
                </header>

                <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
