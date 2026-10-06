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
    PackageCheck,
    RefreshCw,
    ScanLine,
    ScrollText,
    Settings as SettingsIcon,
    Shirt,
    ShieldCheck,
    ShoppingBag,
    Sun,
    Truck,
    UsersRound,
    Users,
    Wallet,
    WifiOff,
    Workflow,
    LayoutDashboard,
    ChartNoAxesCombined,
    Network,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useOnlineStatus, useLastSyncedAt } from '../lib/useOnlineStatus';
import { useFormat } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import LicenseBanner from './LicenseBanner';
import PasswordExpiryBanner from './PasswordExpiryBanner';
import BrandMark from './BrandMark';
import Breadcrumb from './Breadcrumb';
import GlobalSearch from './GlobalSearch';
import StaffAlertsBell from './StaffAlertsBell';
import { Avatar } from './ui/PageHeader';
import { cx, iconButton } from './ui/styles';

// Sidebar toujours sombre (brand-950), indépendamment du thème clair/sombre du
// contenu — c'est ce que montrent systématiquement les captures Figma fournies.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-150',
        isActive ? 'bg-brand-400/20 text-white ring-1 ring-inset ring-brand-400/25' : 'text-brand-100/80 hover:bg-white/10 hover:text-white',
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
            <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-brand-300/70">{label}</p>
            {children}
        </div>
    );
}

// Regroupement à 3 sections (OPERATIONS/PILOTAGE/SYSTÈME, conformité Figma
// 2026-10-06) : purement un réagencement visuel des mêmes liens avec les mêmes
// gates `hasPermission(...)` qu'avant — aucun changement RBAC. OPERATIONS et
// SYSTÈME portent chacune au moins un item non gaté (Nouvelle commande/Dépôts/
// Scan ; Synchronisation/Licence) donc leur wrapper n'a pas besoin de condition
// de visibilité ; PILOTAGE reste conditionnelle (tous ses items sont gatés).
function useSidebarSections(onNavigate?: () => void) {
    const { user } = useAuth();
    const { t } = useI18n();

    return (
        <>
            <NavSection label={t('nav.section.operations')}>
                {hasPermission(user, 'reports.view') && (
                    <NavItem to="/dashboard" icon={LayoutDashboard} label={t('dashboard.title')} onClick={onNavigate} />
                )}
                <NavItem to="/" end icon={ShoppingBag} label={t('nav.newOrder')} onClick={onNavigate} />
                <NavItem to="/orders" icon={ClipboardList} label={t('nav.deposits')} onClick={onNavigate} />
                {hasPermission(user, 'clients.manage') && <NavItem to="/clients" icon={Users} label={t('nav.clients')} onClick={onNavigate} />}
                {hasPermission(user, 'orders.update_status') && (
                    <NavItem to="/atelier" icon={Workflow} label={t('atelier.title')} onClick={onNavigate} />
                )}
                {hasPermission(user, 'orders.manage') && <NavItem to="/pickups" icon={PackageCheck} label={t('nav.pickups')} onClick={onNavigate} />}
                {hasPermission(user, 'payments.manage') && <NavItem to="/cash" icon={Wallet} label={t('nav.cash')} onClick={onNavigate} />}
                <NavItem to="/scan" icon={ScanLine} label={t('nav.scan')} onClick={onNavigate} />
                {(hasPermission(user, 'deliveries.manage') || hasPermission(user, 'deliveries.fulfill')) && (
                    <NavItem to="/deliveries" icon={Truck} label={t('nav.deliveries')} onClick={onNavigate} />
                )}
            </NavSection>

            {(hasPermission(user, 'services.manage') ||
                hasPermission(user, 'reports.view') ||
                hasPermission(user, 'agencies.manage') ||
                hasPermission(user, 'subscriptions.manage') ||
                hasPermission(user, 'clients.manage') ||
                hasPermission(user, 'invoices.manage') ||
                hasPermission(user, 'users.manage')) && (
                <NavSection label={t('nav.section.pilotage')}>
                    {hasPermission(user, 'services.manage') && <NavItem to="/services" icon={Shirt} label={t('nav.services')} onClick={onNavigate} />}
                    {hasPermission(user, 'reports.view') && <NavItem to="/kpi" icon={ChartNoAxesCombined} label={t('nav.kpi')} onClick={onNavigate} />}
                    {hasPermission(user, 'reports.view') && (
                        <NavItem to="/multi-agences" icon={Network} label={t('nav.multiAgency')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'agencies.manage') && (
                        <NavItem to="/agencies" icon={Building2} label={t('nav.agencies')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'subscriptions.manage') && (
                        <NavItem to="/subscriptions" icon={Crown} label={t('subscription.title')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'clients.manage') && <NavItem to="/loyalty" icon={Award} label={t('loyalty.title')} onClick={onNavigate} />}
                    {hasPermission(user, 'invoices.manage') && (
                        <NavItem to="/invoices/outstanding" icon={CircleDollarSign} label={t('invoice.outstandingTitle')} onClick={onNavigate} />
                    )}
                    {hasPermission(user, 'users.manage') && <NavItem to="/users" icon={UsersRound} label={t('users.title')} onClick={onNavigate} />}
                    {hasPermission(user, 'users.manage') && (
                        <NavItem to="/roles-permissions" icon={ShieldCheck} label={t('rbac.title')} onClick={onNavigate} />
                    )}
                </NavSection>
            )}

            <NavSection label={t('nav.section.systeme')}>
                {/* Pas de permission dédiée : concerne la file hors ligne de l'appareil de
                   l'utilisateur courant, pas une donnée privilégiée — même accessibilité que
                   /scan. Voir chantier « Synchronisation ». */}
                <NavItem to="/synchronisation" icon={RefreshCw} label={t('sync.title')} onClick={onNavigate} />
                {hasPermission(user, 'stocks.manage') && <NavItem to="/stock" icon={Boxes} label={t('nav.stock')} onClick={onNavigate} />}
                {(hasPermission(user, 'hr.manage') || hasPermission(user, 'hr.clock')) && (
                    <NavItem to="/hr" icon={UsersRound} label={t('nav.hr')} onClick={onNavigate} />
                )}
                {hasPermission(user, 'notifications.manage') && (
                    <NavItem to="/notifications" icon={Bell} label={t('nav.notifications')} onClick={onNavigate} />
                )}
                {hasPermission(user, 'audit.view') && (
                    <NavItem to="/audit-logs" icon={ScrollText} label={t('auditLogs.title')} onClick={onNavigate} />
                )}
                {/* Visible sans permission dédiée depuis l'harmonisation licence/plateforme
                   (voir CLAUDE.md) : écran lecture seule, l'ancienne permission
                   licenses.manage n'existe plus côté tenant. */}
                <NavItem to="/license" icon={KeyRound} label={t('nav.license')} onClick={onNavigate} />
                {hasPermission(user, 'agencies.manage') && (
                    <NavItem to="/settings" icon={SettingsIcon} label={t('settings.title')} onClick={onNavigate} />
                )}
            </NavSection>
        </>
    );
}

/** Sélecteur d'agence : relocalisé du header vers le haut de la sidebar (conformité
 * Figma 2026-10-06) — pure relocalisation de markup, même contrat `AuthContext`
 * (`agencies`/`activeAgencyId`/`setActiveAgencyId`) déjà découplé de sa présentation. */
function SidebarAgencySelector() {
    const { t } = useI18n();
    const { user, agencies, activeAgencyId, setActiveAgencyId } = useAuth();

    if (user?.agency_id !== null || agencies.length === 0) {
        return null;
    }

    return (
        <div className="px-3 pb-1 pt-3">
            <label className="relative flex items-center">
                <span className="sr-only">{t('nav.agency')}</span>
                <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-brand-200/70" />
                <select
                    value={activeAgencyId ?? ''}
                    onChange={(e) => setActiveAgencyId(e.target.value ? Number(e.target.value) : null)}
                    className="h-10 w-full rounded-xl border border-white/15 bg-white/5 pl-9 pr-8 text-sm font-medium text-white transition hover:bg-white/10 focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-300/20"
                >
                    <option value="">{t('nav.allAgencies')}</option>
                    {agencies.map((agency) => (
                        <option key={agency.id} value={agency.id}>
                            {agency.name}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}

/** Encart « Réseau agences » (bas de sidebar) : uniquement « N agences actives »
 * (réel, `agencies` de `AuthContext` ne liste déjà que les agences actives du
 * pressing) — jamais de « dernière synchro » fabriquée, aucune télémétrie de
 * synchronisation réseau inter-agences n'existe (voir CLAUDE.md, audit Figma
 * 2026-10-06). Réservé à un utilisateur global ayant une vue réseau légitime. */
function SidebarNetworkBox() {
    const { t } = useI18n();
    const { user, agencies } = useAuth();

    if (user?.agency_id !== null || agencies.length === 0) {
        return null;
    }
    if (!hasPermission(user, 'reports.view') && !hasPermission(user, 'agencies.manage')) {
        return null;
    }

    return (
        <div className="mx-3 mb-3 rounded-xl bg-white/5 px-3.5 py-3 ring-1 ring-inset ring-white/10">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                {t('sidebar.network.title')}
            </div>
            <p className="mt-1 text-xs text-brand-100/70">{t('sidebar.network.activeAgencies', { count: agencies.length })}</p>
        </div>
    );
}

/** Pastille de statut (en-tête) : « En ligne »/« Hors ligne » (réel,
 * `useOnlineStatus()`) + « À jour • HH:MM » seulement si une synchronisation
 * a réellement réussi sur cet appareil (`useLastSyncedAt()`) — jamais une
 * heure fabriquée. La bannière d'avertissement hors-ligne existante reste
 * inchangée en dessous ; cette pastille est additive, pas un remplacement. */
function HeaderStatusPill() {
    const { t } = useI18n();
    const { time } = useFormat();
    const online = useOnlineStatus();
    const lastSyncedAt = useLastSyncedAt();

    return (
        <div
            className={cx(
                'hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold sm:flex',
                online
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
            )}
        >
            <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', online ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden="true" />
            {online ? t('sync.status.online') : t('sync.status.offline')}
            {online && lastSyncedAt && (
                <span className="text-ink-500 dark:text-ink-400">· {t('sync.upToDate', { time: time(lastSyncedAt) })}</span>
            )}
        </div>
    );
}

export default function AppLayout() {
    const { user, logout } = useAuth();
    const { t, lang, setLang } = useI18n();
    const { theme, toggleTheme } = useTheme();
    const online = useOnlineStatus();
    const location = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => setMobileNavOpen(false), [location.pathname]);

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
            <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-brand-900/60 bg-brand-950 lg:flex">
                <Link to="/" className="flex h-16 shrink-0 items-center border-b border-white/10 px-5" aria-label={t('app.title')}>
                    <BrandMark inverted />
                </Link>
                <SidebarAgencySelector />
                <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 pb-4">
                    {sidebarSections}
                </nav>
                <SidebarNetworkBox />
            </aside>

            {/* Sidebar — mobile overlay */}
            {mobileNavOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="fixed inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
                    <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-brand-950 shadow-xl">
                        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
                            <Link to="/" aria-label={t('app.title')}>
                                <BrandMark inverted />
                            </Link>
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen(false)}
                                aria-label={t('common.close')}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-brand-100/80 transition hover:bg-white/10 hover:text-white"
                            >
                                <X aria-hidden="true" className="h-5 w-5" />
                            </button>
                        </div>
                        <SidebarAgencySelector />
                        <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 pb-4">
                            {mobileSidebarSections}
                        </nav>
                        <SidebarNetworkBox />
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
                    <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
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

                        <Breadcrumb />
                        <GlobalSearch />

                        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
                            <HeaderStatusPill />
                            <StaffAlertsBell />

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
