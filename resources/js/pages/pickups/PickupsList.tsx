import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarClock, PackageCheck, Printer, Search, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx, input, label as labelClass } from '../../components/ui/styles';
import type { Order, Paginated, PickupSummary } from '../../types';

/* Écran « Centre de retrait » (Figma SPARK PRESSING, section 05, "Retraits en
 * agence") : liste les dépôts prêts à être remis. Toutes les valeurs proviennent de
 * /pickups et /pickups/summary — voir CLAUDE.md pour ce qui a été omis faute de
 * données réelles (colonne "sync" par dépôt, filtre par mode de paiement, scan
 * direct sur cet écran, comparaison "vs lundi dernier"). */

type WorkshopFilter = '' | 'pret' | 'non_recupere';

function workshopTone(order: Order): 'emerald' | 'amber' {
    return order.items.some((item) => item.status === 'non_recupere') ? 'amber' : 'emerald';
}

export default function PickupsList() {
    const { t } = useI18n();
    const { money, dateTime, time } = useFormat();
    const { activeAgencyId } = useAuth();

    const [orders, setOrders] = useState<Order[]>([]);
    const [summary, setSummary] = useState<PickupSummary | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Order>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [promisedDate, setPromisedDate] = useState('');
    const [workshopStatus, setWorkshopStatus] = useState<WorkshopFilter>('');
    const [loading, setLoading] = useState(true);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const params = new URLSearchParams({ page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api.get<PickupSummary>(`/pickups/summary?${params}`).then(setSummary).catch(() => setSummary(null));
    }, [activeAgencyId]);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        if (search.trim()) params.set('q', search.trim());
        if (promisedDate) {
            params.set('promised_from', promisedDate);
            params.set('promised_to', promisedDate);
        }
        if (workshopStatus) params.set('item_status', workshopStatus);
        api
            .get<Paginated<Order>>(`/pickups?${params}`)
            .then((res) => {
                setOrders(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
    }, [search, activeAgencyId, page, promisedDate, workshopStatus]);

    useEffect(() => setPage(1), [activeAgencyId, promisedDate, workshopStatus]);

    const hasActiveFilters = promisedDate !== '' || workshopStatus !== '';
    const resetFilters = () => {
        setPromisedDate('');
        setWorkshopStatus('');
    };

    const showTodayInList = () => {
        setPromisedDate(new Date().toISOString().slice(0, 10));
        setWorkshopStatus('');
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={
                    <span className="flex flex-wrap items-center gap-2.5">
                        {t('pickup.title')}
                        {summary && (
                            <Pill tone="brand" className="align-middle">
                                {t('pickup.readyBadge', { count: summary.ready_orders })}
                            </Pill>
                        )}
                    </span>
                }
                subtitle={t('pickup.subtitle')}
                icon={PackageCheck}
                actions={
                    <>
                        <button type="button" onClick={() => window.print()} className={button('secondary', 'sm')}>
                            <Printer aria-hidden="true" className="h-4 w-4" />
                            {t('pickup.printList')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                searchInputRef.current?.focus();
                            }}
                            className={button('primary', 'sm')}
                        >
                            <PackageCheck aria-hidden="true" className="h-4 w-4" />
                            {t('pickup.quickProcess')}
                        </button>
                    </>
                }
            />

            {summary && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label={t('pickup.summary.readyOrders')} value={summary.ready_orders} icon={PackageCheck} tone="brand" hint={t('pickup.summary.piecesReady', { count: summary.pieces_ready })} />
                    <StatCard label={t('pickup.summary.awaitingNotification')} value={summary.awaiting_notification} icon={Bell} tone="amber" />
                    <StatCard label={t('pickup.summary.pickupsToday')} value={summary.pickups_today} icon={PackageCheck} tone="emerald" />
                    <StatCard
                        label={t('pickup.summary.unpaid')}
                        value={money(summary.unpaid_amount)}
                        icon={AlertTriangle}
                        tone="rose"
                        hint={t('pickup.summary.unpaidOrders', { count: summary.unpaid_orders })}
                    />
                </div>
            )}

            {summary && summary.due_today.length > 0 && (
                <section className={cx(card, 'space-y-3 p-5')} aria-labelledby="pickup-due-today-heading">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 id="pickup-due-today-heading" className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                                <CalendarClock aria-hidden="true" className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                                {t('pickup.dueToday.title')}
                            </h2>
                            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{t('pickup.dueToday.count', { count: summary.due_today.length })}</p>
                        </div>
                        <button type="button" onClick={showTodayInList} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                            {t('pickup.dueToday.seeAll')}
                        </button>
                    </div>
                    <ul className="flex flex-wrap gap-2">
                        {summary.due_today.map((order) => (
                            <li key={order.id}>
                                <Link
                                    to={`/pickups/${order.id}`}
                                    className="flex items-center gap-2.5 rounded-xl border border-ink-200/80 bg-ink-50 px-3 py-2 text-sm transition hover:border-brand-400 hover:bg-brand-50 dark:border-ink-800 dark:bg-ink-950/40 dark:hover:bg-ink-900"
                                >
                                    <span className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{time(order.promised_at)}</span>
                                    <Pill tone={order.balance_due > 0 ? 'amber' : 'emerald'}>{order.balance_due > 0 ? t('pickup.dueToday.toCollect') : t('pickup.paid')}</Pill>
                                    <span className="text-ink-600 dark:text-ink-350">
                                        {t('order.number')}
                                        {order.order_number} · {order.client_name}
                                    </span>
                                    <Pill tone="neutral">{t('pickup.piecesCount', { count: order.pieces_remaining })}</Pill>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 shadow-sm">
                <label className="relative block max-w-md">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                        ref={searchInputRef}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder={t('pickup.searchPlaceholder')}
                        className={cx(input, 'border-transparent pl-10')}
                    />
                </label>
            </div>

            <section className={cx(card, 'space-y-4 p-5')} aria-labelledby="pickup-filters-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="pickup-filters-heading" className="text-sm font-bold text-ink-900 dark:text-white">
                        {t('pickup.filters.title')}
                    </h2>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-ink-500 dark:text-ink-400">{t('pickup.filters.results', { count: meta.total })}</span>
                        {hasActiveFilters && (
                            <button type="button" onClick={resetFilters} className="flex items-center gap-1 text-sm font-semibold text-ink-600 hover:text-ink-900 dark:text-ink-350 dark:hover:text-white">
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                                {t('pickup.filters.reset')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                    <label className="block basis-full sm:basis-auto">
                        <span className={labelClass}>{t('pickup.filters.date')}</span>
                        <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className={cx(input, 'sm:w-48')} />
                    </label>
                    <label className="block basis-full sm:basis-auto">
                        <span className={labelClass}>{t('pickup.filters.workshopStatus')}</span>
                        <select value={workshopStatus} onChange={(e) => setWorkshopStatus(e.target.value as WorkshopFilter)} className={cx(input, 'sm:w-48')}>
                            <option value="">{t('pickup.filters.workshopAll')}</option>
                            <option value="pret">{t('pickup.workshop.ready')}</option>
                            <option value="non_recupere">{t('pickup.workshop.overdue')}</option>
                        </select>
                    </label>
                </div>
            </section>

            <div ref={listRef} className={cx(card, 'overflow-hidden scroll-mt-6')}>
                {loading ? (
                    <LoadingState />
                ) : orders.length === 0 ? (
                    <EmptyState icon={PackageCheck} title={t('pickup.none')} description={t('pickup.noneHint')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[1480px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="w-8 shrink-0" aria-hidden="true" />
                                <span className="w-28 shrink-0">{t('order.table.code')}</span>
                                <span className="w-40 shrink-0">{t('order.client')}</span>
                                <span className="w-32 shrink-0">{t('pickup.table.phone')}</span>
                                <span className="w-24 shrink-0">{t('pickup.table.pieces')}</span>
                                <span className="w-28 shrink-0">{t('pickup.table.workshop')}</span>
                                <span className="w-36 shrink-0">{t('order.table.promised')}</span>
                                <span className="w-32 shrink-0 text-right">{t('pickup.table.total')}</span>
                                <span className="w-32 shrink-0 text-right">{t('pickup.table.balanceDue')}</span>
                                <span className="w-32 shrink-0">{t('pickup.table.notification')}</span>
                                <span className="w-28 shrink-0" aria-hidden="true" />
                            </div>

                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {orders.map((order) => (
                                    <li key={order.id} className="flex items-center gap-4 px-5 py-3">
                                        <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" />

                                        <div className="w-28 shrink-0">
                                            <p className="font-display font-bold text-ink-900 dark:text-white">
                                                {t('order.number')}
                                                {order.order_number}
                                            </p>
                                        </div>

                                        <div className="w-40 min-w-0 shrink-0">
                                            <p className="truncate font-medium text-ink-900 dark:text-white">
                                                {order.client?.first_name} {order.client?.last_name}
                                            </p>
                                        </div>

                                        <p className="w-32 shrink-0 text-sm text-ink-600 dark:text-ink-350">{order.client?.phone || '—'}</p>

                                        <p className="w-24 shrink-0 text-sm text-ink-700 dark:text-ink-200">
                                            {t('pickup.piecesCount', { count: order.pieces_remaining ?? 0 })}
                                        </p>

                                        <div className="w-28 shrink-0">
                                            <Pill tone={workshopTone(order)}>{t(workshopTone(order) === 'amber' ? 'pickup.workshop.overdue' : 'pickup.workshop.ready')}</Pill>
                                        </div>

                                        <p className="w-36 shrink-0 text-sm text-ink-600 dark:text-ink-350">{order.promised_at ? dateTime(order.promised_at) : '—'}</p>

                                        <p className="w-32 shrink-0 text-right font-display font-semibold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</p>

                                        <div className="w-32 shrink-0 text-right">
                                            {order.balance_due && order.balance_due > 0 ? (
                                                <span className="font-display font-bold tabular-nums text-red-700 dark:text-red-400">{money(order.balance_due)}</span>
                                            ) : (
                                                <Pill tone="emerald">{t('pickup.paid')}</Pill>
                                            )}
                                        </div>

                                        <div className="w-32 shrink-0">
                                            {order.notification_status ? (
                                                <StatusBadge kind="notification" status={order.notification_status} />
                                            ) : (
                                                <Pill tone="amber">{t('pickup.notNotified')}</Pill>
                                            )}
                                        </div>

                                        <div className="w-28 shrink-0">
                                            <Link to={`/pickups/${order.id}`} className={button('primary', 'sm')}>
                                                {t('pickup.process')}
                                            </Link>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                <p>{t('pickup.securityNotice')}</p>
            </div>
        </div>
    );
}
