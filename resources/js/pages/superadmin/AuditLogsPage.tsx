import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { platformApi } from '../../lib/platformApi';
import { useFormat } from '../../lib/format';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { card, cx, select } from '../../components/ui/styles';
import type { Paginated, PlatformAuditLog } from '../../types';

/**
 * Phase 3 (observabilité) : écran « Audit global », jusqu'ici absent malgré un
 * mécanisme de journalisation déjà en place et alimenté depuis la Phase 1
 * (`PlatformAuditLog`). Mirrors AuditLogsPage.tsx tenant, en plus simple.
 */
export default function AuditLogsPage() {
    const { dateTime } = useFormat();
    const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<PlatformAuditLog>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [type, setType] = useState('');
    const [loading, setLoading] = useState(true);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (type) params.set('type', type);
        platformApi
            .get<Paginated<PlatformAuditLog>>(`/audit-logs?${params}`)
            .then((res) => {
                setLogs(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [page, type]);

    function describe(log: PlatformAuditLog): string {
        if (log.action.endsWith('.created')) return 'Créé(e)';
        if (log.action.endsWith('.deleted')) return 'Supprimé(e)';
        if (log.action === 'pressing.impersonated') return 'Connexion en tant que (impersonation)';
        if (log.action.endsWith('.updated')) {
            const keys = Object.keys(log.new_values ?? {});
            return keys.length > 0 ? `Modifié(e) : ${keys.join(', ')}` : 'Modifié(e)';
        }
        return log.action;
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <ScrollText aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Audit global</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Activité enregistrée sur les pressings et le personnel ADMIN.</p>
                </div>
            </header>

            <select
                value={type}
                onChange={(e) => {
                    setPage(1);
                    setType(e.target.value);
                }}
                className={cx(select, 'h-10 w-56 text-sm')}
            >
                <option value="">Tous les types</option>
                <option value="pressing">Pressings</option>
                <option value="platform_user">Utilisateurs transverses</option>
            </select>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : logs.length === 0 ? (
                    <EmptyState icon={ScrollText} title="Aucune activité enregistrée" />
                ) : (
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                        {logs.map((log) => (
                            <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{describe(log)}</p>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">
                                        {log.platform_user?.name ?? 'Système'} · {dateTime(log.created_at)}
                                    </p>
                                </div>
                                <Pill tone="neutral">{log.auditable_type.split('\\').pop()}</Pill>
                            </li>
                        ))}
                    </ul>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}
