import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';
import { useFormat } from '../lib/format';
import { auditLogLabel, auditTypeLabel } from '../lib/auditLog';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState, LoadingState } from '../components/ui/Feedback';
import Pagination from '../components/ui/Pagination';
import { Pill } from '../components/ui/StatusBadge';
import { card, cx, input, label as labelClass } from '../components/ui/styles';
import type { AuditLog, Paginated } from '../types';

/* Écran « Audit & logs » (Figma SPARK PRESSING, section PILOTAGE) : journal d'audit
 * générique (`audit_logs`, alimenté automatiquement par le trait `Auditable` sur
 * Order/OrderItem/Client/Payment/Invoice/Delivery/CashMovement/CashClosure/StockMovement).
 * Permission dédiée `audit.view` (admin/manager). */

const TYPES = ['order', 'order_item', 'client', 'payment', 'invoice', 'delivery', 'cash_movement', 'cash_closure', 'stock_movement'] as const;

export default function AuditLogsPage() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { activeAgencyId } = useAuth();

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<AuditLog>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [type, setType] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        if (type) params.set('type', type);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        api
            .get<Paginated<AuditLog>>(`/audit-logs?${params}`)
            .then((res) => {
                setLogs(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch(() => setLogs([]))
            .finally(() => setLoading(false));
    }, [activeAgencyId, type, from, to, page]);

    useEffect(() => setPage(1), [activeAgencyId, type, from, to]);

    return (
        <div className="space-y-6">
            <PageHeader title={t('auditLogs.title')} subtitle={t('auditLogs.subtitle')} icon={ScrollText} />

            <section className={cx(card, 'flex flex-wrap items-end gap-4 p-5')}>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('auditLogs.filters.type')}</span>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={cx(input, 'sm:w-56')}>
                        <option value="">{t('auditLogs.filters.allTypes')}</option>
                        {TYPES.map((value) => (
                            <option key={value} value={value}>
                                {t(`audit.type.${value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('auditLogs.filters.from')}</span>
                    <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cx(input, 'sm:w-44')} />
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('auditLogs.filters.to')}</span>
                    <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(input, 'sm:w-44')} />
                </label>
            </section>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : logs.length === 0 ? (
                    <EmptyState icon={ScrollText} title={t('auditLogs.none')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[760px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="w-36 shrink-0">{t('auditLogs.table.date')}</span>
                                <span className="w-32 shrink-0">{t('auditLogs.table.type')}</span>
                                <span className="flex-1">{t('auditLogs.table.action')}</span>
                                <span className="w-40 shrink-0">{t('auditLogs.table.user')}</span>
                            </div>

                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {logs.map((log) => (
                                    <li key={log.id} className="flex items-center gap-4 px-5 py-3">
                                        <p className="w-36 shrink-0 text-sm text-ink-600 dark:text-ink-350">{dateTime(log.created_at)}</p>
                                        <div className="w-32 shrink-0">
                                            <Pill tone="neutral">{auditTypeLabel(log.auditable_type, t)}</Pill>
                                        </div>
                                        <p className="flex-1 text-sm font-medium text-ink-900 dark:text-white">{auditLogLabel(log, t, money)}</p>
                                        <p className="w-40 shrink-0 truncate text-sm text-ink-600 dark:text-ink-350">{log.user?.name ?? t('order.audit.systemActor')}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}
