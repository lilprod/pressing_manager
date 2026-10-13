import { Pill } from '../ui/StatusBadge';
import { timeAgo } from '../../lib/format';
import type { Pressing } from '../../types';

/* États dérivés côté serveur (PressingController::decorate) — jamais recalculés ici :
 * santé = registre d'incidents, statut = suspension + échéance réelle de licence,
 * synchro = âge du dernier rapport (pressing déployé ailleurs) ou « en direct »
 * (pressing hébergé sur ce déploiement, données lues sans rapport intermédiaire). */

export function countryFlag(code: string | null | undefined): string {
    if (!code || code.length !== 2) return '';
    return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function HealthPill({ pressing }: { pressing: Pressing }) {
    if (!pressing.health) return <span className="text-ink-500">—</span>;
    const map = {
        sain: { tone: 'emerald', label: 'Sain', title: 'Aucun incident ouvert au registre' },
        degrade: { tone: 'amber', label: 'Dégradé', title: 'Incident P2/P3 ouvert' },
        incident: { tone: 'rose', label: 'Incident', title: 'Incident P1 ouvert' },
    } as const;
    const m = map[pressing.health];
    return (
        <span title={m.title}>
            <Pill tone={m.tone}>{m.label}</Pill>
        </span>
    );
}

export function StatusPill({ pressing }: { pressing: Pressing }) {
    if (pressing.status === 'suspended') return <Pill tone="neutral">Suspendu</Pill>;
    if (pressing.license_state === 'expired') return <Pill tone="rose">Licence expirée</Pill>;
    if (pressing.license_state === 'renewal_due') return <Pill tone="amber">À renouveler</Pill>;
    return <Pill tone="emerald">Actif</Pill>;
}

export function SyncState({ pressing }: { pressing: Pressing }) {
    switch (pressing.sync_state) {
        case 'live':
            return <Pill tone="emerald">En direct</Pill>;
        case 'synced':
            return <Pill tone="emerald">Synchronisé</Pill>;
        case 'late':
            return <Pill tone="amber">Retard {formatDelay(pressing.sync_delay_minutes ?? 0)}</Pill>;
        case 'offline':
            return <Pill tone="rose">Hors ligne</Pill>;
        case 'never':
            return <Pill tone="neutral">Aucun rapport</Pill>;
        default:
            return <span className="text-ink-500">—</span>;
    }
}

export function ActivityLabel({ pressing }: { pressing: Pressing }) {
    // Pressing hébergé : dernier dépôt réel ; pressing déployé ailleurs : dernier rapport reçu.
    if (pressing.sync_state === 'live') return <span title="Dernier dépôt enregistré">{timeAgo(pressing.last_activity_at ?? null)}</span>;
    return <span>{timeAgo(pressing.last_report_at)}</span>;
}

function formatDelay(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h`;
}
