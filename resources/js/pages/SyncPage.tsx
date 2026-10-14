import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, CloudOff, History, RefreshCw, RotateCcw, ShieldCheck, Trash2, Wifi, WifiOff } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { SectionCard, StatCard } from '../components/ui/Metrics';
import { EmptyState, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button } from '../components/ui/styles';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { useOnlineStatus, useLastSyncedAt } from '../lib/useOnlineStatus';
import { useSyncQueue } from '../lib/useSyncQueue';
import {
    discardPendingOrder,
    flushPendingOrders,
    getSyncHistory,
    getSyncIntervalMinutes,
    getSyncProgress,
    retryPendingOrder,
    syncEvents,
    type SyncedOperation,
    type SyncProgress,
} from '../lib/sync';
import type { PendingOrder } from '../lib/offlineDb';

/**
 * « Retour en ligne et synchronisation » — tout ce qui est affiché vient de l'appareil :
 * file IndexedDB (dépôts saisis hors ligne, seule file hors ligne de l'app), progression
 * réelle de la passe en cours, historique local des opérations synchronisées (numéro local →
 * numéro serveur, encaissement rapproché), conflits (refus serveur) avec des résolutions
 * réelles : réessayer, réessayer sans code promo / sans remise, retirer de la file.
 */
export default function SyncPage() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const online = useOnlineStatus();
    const lastSyncedAt = useLastSyncedAt();
    const queue = useSyncQueue();
    const [history, setHistory] = useState<SyncedOperation[]>(() => getSyncHistory());
    const [progress, setProgress] = useState<SyncProgress | null>(() => getSyncProgress());
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        const refresh = () => {
            setHistory(getSyncHistory());
            setProgress(getSyncProgress() ? { ...getSyncProgress()! } : null);
        };
        syncEvents.addEventListener('change', refresh);
        return () => syncEvents.removeEventListener('change', refresh);
    }, []);

    const pending = queue.filter((o) => o.status === 'pending');
    const conflicts = queue.filter((o) => o.status === 'error');
    const interval = getSyncIntervalMinutes();
    const renumbered = history.filter((h) => h.local_reference);
    const paymentsRequested = history.filter((h) => h.payment_requested);
    const paymentsReconciled = paymentsRequested.filter((h) => h.payment_recorded);

    async function run(key: string, action: () => Promise<void>) {
        setBusy(key);
        try {
            await action();
        } finally {
            setBusy(null);
        }
    }

    function discard(order: PendingOrder) {
        if (!window.confirm(t('sync.conflict.discardConfirm', { label: order.preview.local_reference ?? order.preview.client_label }))) return;
        void run(`discard-${order.client_local_uuid}`, () => discardPendingOrder(order.client_local_uuid));
    }

    const progressPct = progress && progress.total > 0 ? Math.round(((progress.done + progress.failed) / progress.total) * 100) : 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('sync.title')}
                subtitle={t('sync.subtitle')}
                icon={RefreshCw}
                actions={
                    <button
                        type="button"
                        onClick={() => void run('flush', flushPendingOrders)}
                        disabled={!online || busy !== null || pending.length === 0}
                        className={button('accent')}
                    >
                        {busy === 'flush' || progress ? <Spinner className="h-4 w-4" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                        {t('sync.forceNow')}
                    </button>
                }
            />

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label={t('sync.status.title')}
                    value={online ? t('sync.status.online') : t('sync.status.offline')}
                    icon={online ? Wifi : WifiOff}
                    tone={online ? 'emerald' : 'amber'}
                    hint={lastSyncedAt ? t('sync.lastSyncedAt', { time: dateTime(lastSyncedAt) }) : t('sync.neverSynced')}
                />
                <StatCard label={t('sync.kpi.pending')} value={pending.length} icon={CloudOff} tone={pending.length > 0 ? 'amber' : 'neutral'} />
                <StatCard label={t('sync.kpi.conflicts')} value={conflicts.length} icon={AlertTriangle} tone={conflicts.length > 0 ? 'rose' : 'neutral'} />
                <StatCard label={t('sync.kpi.synced')} value={history.length} icon={CheckCircle2} tone="emerald" hint={t('sync.kpi.syncedHint')} />
            </div>

            <SectionCard id="sync-progress" title={t('sync.progress.title')}>
                {progress ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-ink-900 dark:text-white">
                                {t('sync.progress.running', { done: progress.done + progress.failed, total: progress.total })}
                            </span>
                            <span className="tabular-nums text-ink-600 dark:text-ink-350">{progressPct} %</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-ink-700 dark:text-ink-200">
                        {pending.length === 0 && conflicts.length === 0 ? t('sync.progress.idleClean') : t('sync.progress.idleWaiting', { count: pending.length })}
                    </p>
                )}
                <p className="mt-3 flex items-start gap-2 text-xs text-ink-600 dark:text-ink-350">
                    <RotateCcw aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {interval ? t('sync.autoResume.minutes', { minutes: interval }) : t('sync.autoResume.default')}
                </p>
            </SectionCard>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <SectionCard id="sync-queue-detail" title={t('sync.queue.detailTitle')} subtitle={t('sync.queue.detailSubtitle')} flush>
                    {queue.length === 0 ? (
                        <EmptyState icon={CheckCircle2} title={t('sync.queue.empty')} compact />
                    ) : (
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {[...conflicts, ...pending].map((order) => (
                                <li key={order.client_local_uuid} className="space-y-2.5 px-5 py-3.5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-ink-900 dark:text-ink-50">
                                                {order.preview.local_reference ? `${order.preview.local_reference} · ` : ''}
                                                {order.preview.client_label}
                                            </p>
                                            <p className="text-sm text-ink-600 dark:text-ink-350">
                                                {t('sync.queue.itemsCount', { count: order.preview.items_count })} · {money(order.preview.total_amount)} ·{' '}
                                                {dateTime(order.created_at)}
                                            </p>
                                            <p className="truncate font-mono text-[11px] text-ink-500 dark:text-ink-400">{order.client_local_uuid}</p>
                                        </div>
                                        {order.status === 'error' ? (
                                            <Pill tone="rose">{t('sync.queue.statusError')}</Pill>
                                        ) : (
                                            <Pill tone="amber">{t('sync.queue.statusPending')}</Pill>
                                        )}
                                    </div>
                                    {order.status === 'error' && (
                                        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
                                            <p className="text-sm text-red-800 dark:text-red-200">
                                                <span className="font-semibold">{t('sync.conflict.reason')} </span>
                                                {order.error ?? '—'}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    disabled={!online || busy !== null}
                                                    onClick={() => void run(`retry-${order.client_local_uuid}`, () => retryPendingOrder(order))}
                                                    className={button('secondary', 'sm')}
                                                >
                                                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                                                    {t('sync.conflict.retry')}
                                                </button>
                                                {order.payload.promotion_code && (
                                                    <button
                                                        type="button"
                                                        disabled={!online || busy !== null}
                                                        onClick={() => void run(`promo-${order.client_local_uuid}`, () => retryPendingOrder(order, 'without_promotion'))}
                                                        className={button('secondary', 'sm')}
                                                    >
                                                        {t('sync.conflict.withoutPromotion', { code: order.payload.promotion_code })}
                                                    </button>
                                                )}
                                                {(order.payload.discount_amount ?? 0) > 0 && (
                                                    <button
                                                        type="button"
                                                        disabled={!online || busy !== null}
                                                        onClick={() => void run(`discount-${order.client_local_uuid}`, () => retryPendingOrder(order, 'without_discount'))}
                                                        className={button('secondary', 'sm')}
                                                    >
                                                        {t('sync.conflict.withoutDiscount', { amount: money(order.payload.discount_amount ?? 0) })}
                                                    </button>
                                                )}
                                                <button type="button" disabled={busy !== null} onClick={() => discard(order)} className={button('danger', 'sm')}>
                                                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                                    {t('sync.conflict.discard')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard id="sync-integrity" title={t('sync.integrity.title')}>
                    <ul className="space-y-3 text-sm">
                        <IntegrityRow ok title={t('sync.integrity.dedup')} detail={t('sync.integrity.dedupDetail')} />
                        <IntegrityRow
                            ok
                            title={t('sync.integrity.renumber')}
                            detail={t('sync.integrity.renumberDetail', { count: renumbered.length })}
                        />
                        <IntegrityRow
                            ok={paymentsReconciled.length === paymentsRequested.length}
                            title={t('sync.integrity.payments')}
                            detail={t('sync.integrity.paymentsDetail', { done: paymentsReconciled.length, total: paymentsRequested.length })}
                        />
                        <IntegrityRow
                            ok={conflicts.length === 0}
                            title={t('sync.integrity.conflicts')}
                            detail={conflicts.length === 0 ? t('sync.integrity.conflictsNone') : t('sync.integrity.conflictsSome', { count: conflicts.length })}
                        />
                    </ul>
                </SectionCard>
            </div>

            <SectionCard id="sync-history" title={t('sync.history.title')} subtitle={t('sync.history.subtitle')} flush>
                {history.length === 0 ? (
                    <EmptyState icon={History} title={t('sync.history.empty')} compact />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-ink-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:bg-ink-950/40 dark:text-ink-400">
                                <tr>
                                    <th className="px-5 py-2.5">{t('sync.history.renumbering')}</th>
                                    <th className="px-3 py-2.5">{t('order.client')}</th>
                                    <th className="px-3 py-2.5 text-right">{t('common.total')}</th>
                                    <th className="px-3 py-2.5">{t('sync.history.payment')}</th>
                                    <th className="px-5 py-2.5">{t('sync.history.syncedAt')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                {history.map((h) => (
                                    <tr key={h.client_local_uuid}>
                                        <td className="px-5 py-2.5">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="font-mono text-xs text-ink-600 dark:text-ink-350">{h.local_reference ?? '—'}</span>
                                                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-ink-400" />
                                                <Link to={`/orders/${h.order_id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
                                                    N° {h.order_number}
                                                </Link>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-ink-800 dark:text-ink-100">{h.client_label}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{money(h.total_amount)}</td>
                                        <td className="px-3 py-2.5">
                                            {!h.payment_requested ? (
                                                <span className="text-ink-500">—</span>
                                            ) : h.payment_recorded ? (
                                                <Pill tone="emerald">{t('sync.history.reconciled')}</Pill>
                                            ) : (
                                                <Pill tone="amber">{t('sync.history.notReconciled')}</Pill>
                                            )}
                                        </td>
                                        <td className="px-5 py-2.5 text-ink-600 dark:text-ink-350">{dateTime(h.synced_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}

function IntegrityRow({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
    return (
        <li className="flex items-start gap-2.5">
            {ok ? (
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div>
                <p className="font-semibold text-ink-900 dark:text-ink-50">{title}</p>
                <p className="text-xs text-ink-600 dark:text-ink-350">{detail}</p>
            </div>
        </li>
    );
}
