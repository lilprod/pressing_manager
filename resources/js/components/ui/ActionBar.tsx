import type { ReactNode } from 'react';

/**
 * Barre d'action sticky pleine largeur, toujours sombre quelle que soit le thème
 * clair/sombre du contenu (même convention que la sidebar — voir CLAUDE.md « Sidebar
 * toujours sombre » : pas de classes `dark:` conditionnelles ici, directement les tons
 * clairs adaptés à un fond sombre permanent). Conforme aux captures Figma « Nouveau
 * mouvement de caisse »/« Clôture et rapprochement journalier » : statut à gauche,
 * actions à droite.
 */
export function ActionBar({ status, children }: { status?: ReactNode; children: ReactNode }) {
    return (
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-2xl bg-brand-900 px-5 py-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0 flex-1 text-sm font-medium text-brand-100/90">{status}</div>
            <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
        </div>
    );
}

export const actionBarGhostButton =
    'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink-900 shadow-sm transition hover:bg-ink-100 active:scale-[0.98]';
