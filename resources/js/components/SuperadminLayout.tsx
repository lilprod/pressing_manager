import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Building2, LayoutDashboard, Layers, LogOut, ScrollText, Settings, ShieldHalf, UsersRound } from 'lucide-react';
import { useSuperadminAuth } from '../contexts/SuperadminAuthContext';
import { PlatformLogo } from './PlatformBrand';
import { Avatar } from './ui/PageHeader';
import { cx, iconButton } from './ui/styles';

/* Sidebar dédiée à la console superadmin — pas une variante d'AppLayout (auth
 * et navigation totalement distincts du staff pressing), mais le **branding**
 * doit rester celui de l'application (même logo, même vert `brand-950` que la
 * sidebar tenant — voir CLAUDE.md « Sidebar toujours sombre ») : avant cette
 * passe, cet écran utilisait `ink-950` (slate/noir) + un badge texte « SP » sur
 * fond or, sans rapport avec l'identité réelle de l'app — décalage repéré par
 * l'utilisateur, corrigé ici. `BrandLogo` retombe sur le pictogramme vert par
 * défaut (jamais le logo d'un pressing précis) car cette console s'authentifie
 * sur le guard `platform`, jamais `sanctum` — `GET /settings` ne résout donc
 * aucun `pressing_id` ici (voir `SettingsController::show()`). Nav limitée aux
 * écrans réellement construits (Vue plateforme, Pressings, Utilisateurs transverses
 * depuis la Phase 2) : les items non construits (Agences cross-tenant, Audit global,
 * Synchronisation, Configuration) restent omis plutôt que grisés — un lien grisé
 * reste une promesse d'UI non tenue, voir CLAUDE.md « ne pas fabriquer de données ». */

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-150',
        isActive ? 'bg-brand-400/20 text-white ring-1 ring-inset ring-brand-400/25' : 'text-brand-100/80 hover:bg-white/10 hover:text-white',
    );

export default function SuperadminLayout() {
    const { user, logout, appName } = useSuperadminAuth();

    useEffect(() => {
        if (!appName) return;
        const previousTitle = document.title;
        document.title = appName;
        return () => {
            document.title = previousTitle;
        };
    }, [appName]);

    return (
        <div className="flex min-h-screen bg-ink-50 dark:bg-ink-950">
            <aside className="hidden w-64 shrink-0 flex-col bg-brand-950 p-4 lg:flex">
                <div className="flex items-center gap-2.5 px-2 py-3">
                    <PlatformLogo className="h-9 w-9" />
                    <span className="flex flex-col leading-none">
                        <span className="font-display text-[15px] font-extrabold text-white">{appName}</span>
                        <span className="mt-1 text-[11px] font-medium text-brand-100">Console plateforme</span>
                    </span>
                </div>
                <nav className="mt-4 flex-1 space-y-1">
                    <p className="px-3 pb-1 pt-1 text-xs font-bold uppercase tracking-wider text-brand-300/70">Plateforme</p>
                    <NavLink to="/superadmin/dashboard" className={navLinkClass}>
                        <LayoutDashboard aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Vue plateforme</span>
                    </NavLink>
                    <NavLink to="/superadmin/pressings" className={navLinkClass}>
                        <Building2 aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Pressings</span>
                    </NavLink>
                    <NavLink to="/superadmin/users" className={navLinkClass}>
                        <UsersRound aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Utilisateurs transverses</span>
                    </NavLink>
                    <NavLink to="/superadmin/roles" className={navLinkClass}>
                        <ShieldHalf aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Rôles</span>
                    </NavLink>
                    <NavLink to="/superadmin/plans" className={navLinkClass}>
                        <Layers aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Plans</span>
                    </NavLink>
                    <NavLink to="/superadmin/audit-logs" className={navLinkClass}>
                        <ScrollText aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Audit global</span>
                    </NavLink>
                    <NavLink to="/superadmin/settings" className={navLinkClass}>
                        <Settings aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                        <span className="truncate">Paramètres</span>
                    </NavLink>
                </nav>
                <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
                    <NavLink to="/superadmin/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 hover:bg-white/10">
                        <Avatar firstName={user?.name} size="sm" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                            <p className="truncate text-xs text-brand-200/70">{user?.platform_role?.name ?? 'Superadmin'}</p>
                        </div>
                    </NavLink>
                    <button type="button" onClick={() => void logout()} aria-label="Déconnexion" className={cx(iconButton, 'text-brand-100/70 hover:bg-white/10 hover:text-white')}>
                        <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
                    </button>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/85">
                    <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
                        <PlatformLogo className="h-8 w-8 lg:hidden" />
                        <p className="hidden truncate text-sm font-semibold text-ink-700 sm:block dark:text-ink-200">Console plateforme</p>

                        <div className="ml-auto flex items-center gap-2">
                            {user && (
                                <NavLink
                                    to="/superadmin/profile"
                                    className="flex items-center gap-2.5 rounded-xl border-l border-ink-200 pl-3 transition hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-800"
                                >
                                    <Avatar firstName={user.name.split(' ')[0]} lastName={user.name.split(' ').slice(1).join(' ')} size="sm" />
                                    <div className="hidden max-w-[12rem] leading-tight md:block">
                                        <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{user.name}</p>
                                        <p className="truncate text-xs text-ink-600 dark:text-ink-350">{user.platform_role?.name ?? 'Superadmin'}</p>
                                    </div>
                                </NavLink>
                            )}

                            <button
                                type="button"
                                onClick={() => void logout()}
                                aria-label="Déconnexion"
                                title="Déconnexion"
                                className={cx(iconButton, 'text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10 dark:hover:text-red-200')}
                            >
                                <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
