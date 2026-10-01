import { NavLink, Outlet } from 'react-router-dom';
import { Building2, LayoutDashboard, LogOut, UsersRound } from 'lucide-react';
import { useSuperadminAuth } from '../contexts/SuperadminAuthContext';
import { Avatar } from './ui/PageHeader';
import { cx, iconButton } from './ui/styles';

/* Sidebar dédiée à la console superadmin — pas une variante d'AppLayout (auth,
 * branding et navigation totalement distincts du staff pressing). Nav limitée aux
 * écrans réellement construits (Vue plateforme, Pressings, Utilisateurs transverses
 * depuis la Phase 2) : les items non construits (Agences cross-tenant, Audit global,
 * Synchronisation, Configuration) restent omis plutôt que grisés — un lien grisé
 * reste une promesse d'UI non tenue, voir CLAUDE.md « ne pas fabriquer de données ». */

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-150',
        isActive ? 'bg-accent-400/20 text-white ring-1 ring-inset ring-accent-400/25' : 'text-ink-200/80 hover:bg-white/10 hover:text-white',
    );

export default function SuperadminLayout() {
    const { user, logout } = useSuperadminAuth();

    return (
        <div className="flex min-h-screen bg-ink-50 dark:bg-ink-950">
            <aside className="hidden w-64 shrink-0 flex-col bg-ink-950 p-4 lg:flex">
                <div className="flex items-center gap-2.5 px-2 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 font-display text-sm font-extrabold text-ink-950">
                        SP
                    </span>
                    <span className="font-display text-[15px] font-extrabold text-white">SPARK PRESSING</span>
                </div>
                <nav className="mt-4 flex-1 space-y-1">
                    <p className="px-3 pb-1 pt-1 text-xs font-bold uppercase tracking-wider text-ink-400/70">Plateforme</p>
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
                </nav>
                <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-4">
                    <Avatar firstName={user?.name} size="sm" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                        <p className="truncate text-xs text-ink-300">Superadmin</p>
                    </div>
                    <button type="button" onClick={() => void logout()} aria-label="Déconnexion" className={cx(iconButton, 'text-ink-300 hover:text-white')}>
                        <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
                    </button>
                </div>
            </aside>

            <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
                <Outlet />
            </main>
        </div>
    );
}
