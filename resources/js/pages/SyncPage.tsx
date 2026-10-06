import { useState } from 'react';
import { CheckCircle2, CloudOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { SectionCard } from '../components/ui/Metrics';
import { EmptyState, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button, cx } from '../components/ui/styles';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { useOnlineStatus, useLastSyncedAt } from '../lib/useOnlineStatus';
import { useSyncQueue } from '../lib/useSyncQueue';
import { flushPendingOrders } from '../lib/sync';

/**
 * Écran minimal réel (chantier « Synchronisation », audit Figma 2026-10-06) : statut
 * en ligne/hors ligne, dernière synchronisation réussie, file d'attente réelle
 * (IndexedDB, dépôts comptoir uniquement — la seule file hors ligne de l'app),
 * synchronisation forcée. Volontairement omis (chantier à part, déjà documenté
 * comme non prioritaire dans CLAUDE.md) : résolution de conflit interactive, détail
 * multi-opérations (encaissements/fiches client — hors de cette file), contrôles
 * d'intégrité listés un par un, vue multi-agences de la synchronisation.
 */
export default function SyncPage() {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const online = useOnlineStatus();
    const lastSyncedAt = useLastSyncedAt();
    const pending = useSyncQueue();
    const [syncing, setSyncing] = useState(false);

    async function forceSync() {
        setSyncing(true);
        try {
            await flushPendingOrders();
        } finally {
            setSyncing(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('sync.title')} subtitle={t('sync.subtitle')} icon={RefreshCw} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SectionCard id="sync-status" title={t('sync.status.title')}>
                    <div className="flex items-center gap-3">
                        <span
                            className={cx(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
                                online
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
                                    : 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
                            )}
                        >
                            {online ? <Wifi aria-hidden="true" className="h-5 w-5" /> : <WifiOff aria-hidden="true" className="h-5 w-5" />}
                        </span>
                        <div>
                            <p className="font-semibold text-ink-900 dark:text-ink-50">{online ? t('sync.status.online') : t('sync.status.offline')}</p>
                            <p className="text-sm text-ink-600 dark:text-ink-350">
                                {lastSyncedAt ? t('sync.lastSyncedAt', { time: dateTime(lastSyncedAt) }) : t('sync.neverSynced')}
                            </p>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard id="sync-queue-summary" title={t('sync.queue.title')}>
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                            <CloudOff aria-hidden="true" className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{pending.length}</p>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('sync.queue.pendingCount', { count: pending.length })}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void forceSync()}
                        disabled={!online || syncing || pending.length === 0}
                        className={cx(button('secondary', 'sm'), 'mt-4')}
                    >
                        {syncing ? <Spinner className="h-4 w-4" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                        {t('sync.forceNow')}
                    </button>
                </SectionCard>
            </div>

            <SectionCard id="sync-queue-detail" title={t('sync.queue.detailTitle')} subtitle={t('sync.queue.detailSubtitle')} flush>
                {pending.length === 0 ? (
                    <EmptyState icon={CheckCircle2} title={t('sync.queue.empty')} compact />
                ) : (
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                        {pending.map((order) => (
                            <li key={order.client_local_uuid} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{order.preview.client_label}</p>
                                    <p className="text-sm text-ink-600 dark:text-ink-350">
                                        {t('sync.queue.itemsCount', { count: order.preview.items_count })} · {dateTime(order.created_at)}
                                    </p>
                                </div>
                                {order.status === 'error' ? (
                                    <Pill tone="rose">{order.error ?? t('sync.queue.statusError')}</Pill>
                                ) : (
                                    <Pill tone="amber">{t('sync.queue.statusPending')}</Pill>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>
        </div>
    );
}
