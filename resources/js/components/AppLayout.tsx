import { Link, NavLink, Outlet } from 'react-router-dom';
import { Boxes, Building2, ClipboardList, Crown, KeyRound, Languages, LogOut, Moon, ScanLine, ShoppingBag, Sun, Truck, UsersRound, Users, WifiOff, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { hasPermission } from '../lib/permissions';
import LicenseBanner from './LicenseBanner';
import BrandMark from './BrandMark';
import { Avatar } from './ui/PageHeader';
import { cx, iconButton } from './ui/styles';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
        'group inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition duration-150',
        isActive
            ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-400/15 dark:text-brand-200 dark:ring-brand-400/20'
            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
    );

function NavItem({ to, icon: Icon, label, end }: { to: string; icon: LucideIcon; label: string; end?: boolean }) {
    return (
        <NavLink to={to} end={end} className={navLinkClass}>
            <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
            {label}
        </NavLink>
    );
}

export default function AppLayout() {
    const { user, agencies, activeAgencyId, setActiveAgencyId, logout } = useAuth();
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();
    const online = useOnlineStatus();

    const isGlobal = user?.agency_id === null;
    const [firstName, ...rest] = (user?.name ?? '').split(' ');
    const lastName = rest[rest.length - 1];

    return (
        <div className="flex min-h-screen flex-col">
            <a href="#main-content" className="skip-link">
                {t('a11y.skipToContent')}
            </a>

            {!online && (
                <div role="status" className="flex items-center justify-center gap-2 bg-amber-800 px-4 py-2 text-center text-sm font-medium text-white">
                    <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {t('common.offline')}
                </div>
            )}

            <LicenseBanner />

            <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/85">
                <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
                    <Link to="/" className="shrink-0 rounded-xl" aria-label={t('app.title')}>
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
                            <div className="ml-1 hidden items-center gap-2.5 border-l border-ink-200 pl-3 md:flex dark:border-ink-800">
                                <Avatar firstName={firstName} lastName={lastName} size="sm" />
                                <div className="hidden max-w-[12rem] leading-tight lg:block">
                                    <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{user.name}</p>
                                    <p className="truncate text-xs text-ink-600 dark:text-ink-350">{user.agency?.name ?? user.role?.name}</p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => void logout()}
                            aria-label={t('nav.logout')}
                            title={t('nav.logout')}
                            className={cx(iconButton, 'text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-400/10 dark:hover:text-rose-200')}
                        >
                            <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
                        </button>
                    </div>
                </div>

                <nav aria-label={t('nav.main')} className="scrollbar-none mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2.5 sm:px-6">
                    {/* Comptoir & suivi commande */}
                    <NavItem to="/" end icon={ShoppingBag} label={t('nav.newOrder')} />
                    <NavItem to="/orders" icon={ClipboardList} label={t('nav.orders')} />
                    <NavItem to="/scan" icon={ScanLine} label={t('nav.scan')} />
                    {(hasPermission(user, 'deliveries.manage') || hasPermission(user, 'deliveries.fulfill')) && (
                        <NavItem to="/deliveries" icon={Truck} label={t('nav.deliveries')} />
                    )}

                    {/* Relation client */}
                    {hasPermission(user, 'clients.manage') && <NavItem to="/clients" icon={Users} label={t('nav.clients')} />}
                    {hasPermission(user, 'subscriptions.manage') && <NavItem to="/subscriptions" icon={Crown} label={t('subscription.title')} />}

                    {/* Ressources & back-office */}
                    {hasPermission(user, 'stocks.manage') && <NavItem to="/stock" icon={Boxes} label={t('nav.stock')} />}
                    {(hasPermission(user, 'hr.manage') || hasPermission(user, 'hr.clock')) && <NavItem to="/hr" icon={UsersRound} label={t('nav.hr')} />}

                    {/* Pilotage */}
                    {hasPermission(user, 'reports.view') && <NavItem to="/kpi" icon={LayoutDashboard} label={t('nav.kpi')} />}
                    {hasPermission(user, 'licenses.manage') && <NavItem to="/license" icon={KeyRound} label={t('nav.license')} />}
                </nav>
            </header>

            <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
                <Outlet />
            </main>
        </div>
    );
}
