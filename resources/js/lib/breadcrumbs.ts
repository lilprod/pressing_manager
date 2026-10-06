/**
 * Fil d'Ariane (en-tête) : table statique route → {section, page}, puisque
 * `App.tsx` déclare des routes plates (pas de hiérarchie exploitable
 * automatiquement — voir CLAUDE.md, audit Figma 2026-10-06). Triée du chemin
 * le plus spécifique au moins spécifique : `resolveBreadcrumb()` prend la
 * première entrée dont le chemin est un préfixe exact (segment par segment)
 * du pathname courant, pas un simple `startsWith` sur la chaîne brute (sinon
 * `/services` matcherait aussi `/services-x`).
 *
 * Les sous-écrans d'un même module (ex. `/clients/:id/edit`) réutilisent le
 * libellé du module parent — c'est la même convention que montre la capture
 * Figma (« Articles & tarifs / Catalogue », pas un libellé par sous-écran).
 * Les 3 sous-pages de Paramètres (branding/sécurité/opérationnel) réutilisent
 * toutes le libellé « Paramètres » plutôt que d'inventer 3 nouvelles clés
 * i18n pour des écrans qui ont déjà leur propre lien de retour.
 */
export interface BreadcrumbEntry {
    path: string;
    section: string | null;
    page: string;
}

export const BREADCRUMB_ENTRIES: BreadcrumbEntry[] = [
    { path: '/', section: 'nav.section.operations', page: 'nav.newOrder' },
    { path: '/dashboard', section: 'nav.section.operations', page: 'dashboard.title' },
    { path: '/orders', section: 'nav.section.operations', page: 'nav.deposits' },
    { path: '/atelier', section: 'nav.section.operations', page: 'atelier.title' },
    { path: '/pickups', section: 'nav.section.operations', page: 'nav.pickups' },
    { path: '/cash', section: 'nav.section.operations', page: 'nav.cash' },
    { path: '/scan', section: 'nav.section.operations', page: 'nav.scan' },
    { path: '/clients', section: 'nav.section.operations', page: 'nav.clients' },
    { path: '/deliveries', section: 'nav.section.operations', page: 'nav.deliveries' },

    { path: '/services/treatment-types', section: 'nav.section.pilotage', page: 'treatmentType.navLink' },
    { path: '/services', section: 'nav.section.pilotage', page: 'nav.services' },
    { path: '/kpi', section: 'nav.section.pilotage', page: 'nav.kpi' },
    { path: '/reports/daily', section: 'nav.section.pilotage', page: 'dailyReport.title' },
    { path: '/multi-agences', section: 'nav.section.pilotage', page: 'nav.multiAgency' },
    { path: '/agencies', section: 'nav.section.pilotage', page: 'nav.agencies' },
    { path: '/subscriptions', section: 'nav.section.pilotage', page: 'subscription.title' },
    { path: '/loyalty', section: 'nav.section.pilotage', page: 'loyalty.title' },
    { path: '/invoices/outstanding', section: 'nav.section.pilotage', page: 'invoice.outstandingTitle' },
    { path: '/users', section: 'nav.section.pilotage', page: 'users.title' },
    { path: '/roles-permissions', section: 'nav.section.pilotage', page: 'rbac.title' },

    { path: '/synchronisation', section: 'nav.section.systeme', page: 'sync.title' },
    { path: '/stock', section: 'nav.section.systeme', page: 'nav.stock' },
    { path: '/hr', section: 'nav.section.systeme', page: 'nav.hr' },
    { path: '/notifications', section: 'nav.section.systeme', page: 'nav.notifications' },
    { path: '/audit-logs', section: 'nav.section.systeme', page: 'auditLogs.title' },
    { path: '/license', section: 'nav.section.systeme', page: 'nav.license' },
    { path: '/settings', section: 'nav.section.systeme', page: 'settings.title' },

    { path: '/profile', section: null, page: 'profile.title' },
].sort((a, b) => b.path.length - a.path.length);

export function resolveBreadcrumb(pathname: string): BreadcrumbEntry | null {
    for (const entry of BREADCRUMB_ENTRIES) {
        if (entry.path === '/') {
            if (pathname === '/') return entry;
            continue;
        }
        if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) {
            return entry;
        }
    }
    return null;
}
