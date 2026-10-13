import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Gem, Pencil, Search, Sparkles, UserPlus, Users, UserRoundPlus } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import type { Client, ClientStats, Paginated } from '../../types';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { ChipToggle, percentChange, ProgressBar, StatCard, trend } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cardPadded, cx, inputLg, select, sectionTitle } from '../../components/ui/styles';

/* Répertoire clients (capture Figma « Clients », audit du 2026-10-13). Toutes les
 * colonnes viennent de GET /clients?with_metrics=1 (agrégats en sous-requêtes) et la
 * répartition fidélité de GET /clients/stats (by_tier, même calcul que la carte
 * Fidélité des Rapports). Omis : statut « Archivé » (aucun état distinct de
 * « inactif » n'existe) et bouton « Colonnes » configurables. */

type Activity = '' | 'today' | 'week' | 'month';
type Status = '' | 'active' | 'inactive';

const TIER_BARS = ['bg-ink-400', 'bg-emerald-500', 'bg-accent-500', 'bg-brand-600', 'bg-sky-500'];

export default function ClientsList() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { activeAgencyId } = useAuth();
    const [search, setSearch] = useState('');
    const [activity, setActivity] = useState<Activity>('');
    const [tierId, setTierId] = useState<number | null>(null);
    const [status, setStatus] = useState<Status>('');
    const [clients, setClients] = useState<Client[]>([]);
    const [stats, setStats] = useState<ClientStats | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Client>, 'current_page' | 'last_page' | 'total'>>({ current_page: 1, last_page: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function filters(): URLSearchParams {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (activity) params.set('activity', activity);
        if (tierId) params.set('tier_id', String(tierId));
        if (status) params.set('status', status);
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        return params;
    }

    function reload() {
        setLoading(true);
        const params = filters();
        params.set('page', String(page));
        params.set('with_metrics', '1');
        api.get<Paginated<Client>>(`/clients?${params}`)
            .then((res) => {
                setClients(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reload, [page]);

    useEffect(() => {
        const query = activeAgencyId ? `?agency_id=${activeAgencyId}` : '';
        api.get<ClientStats>(`/clients/stats${query}`).then(setStats).catch(() => setStats(null));
    }, [activeAgencyId]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (page === 1) reload();
            else setPage(1);
        }, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, activity, tierId, status, activeAgencyId]);

    async function exportExcel() {
        setExporting(true);
        try {
            const blob = await api.blob(`/clients/export?${filters()}`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `clients-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setExporting(false);
        }
    }

    const tierTotal = stats?.by_tier.reduce((sum, tier) => sum + tier.count, 0) ?? 0;
    const tierName = (id: number | null | undefined) => stats?.by_tier.find((tier) => tier.id === id)?.name ?? null;

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('nav.clients')}
                subtitle={t('client.listSubtitle')}
                icon={Users}
                actions={
                    <Link to="/clients/new" className={button('primary')}>
                        <UserPlus aria-hidden="true" className="h-4 w-4" />
                        {t('client.new')}
                    </Link>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}

            {stats && (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
                    <StatCard label={t('client.stats.active')} value={stats.active_count} icon={Users} tone="brand" />
                    <StatCard
                        label={t('client.stats.newThisMonth')}
                        value={stats.new_this_month}
                        icon={UserRoundPlus}
                        tone="emerald"
                        hint={t('client.stats.newThisWeek', { count: stats.new_this_week })}
                    />
                    <StatCard
                        label={t('client.stats.vip')}
                        value={stats.vip_count}
                        icon={Gem}
                        tone="accent"
                        hint={t('client.stats.vipShare', { percent: stats.active_count > 0 ? Math.round((stats.vip_count / stats.active_count) * 1000) / 10 : 0 })}
                    />
                    <StatCard
                        label={t('client.stats.pointsThisMonth')}
                        value={stats.points_issued_this_month}
                        icon={Sparkles}
                        tone="amber"
                        {...trend(percentChange(stats.points_issued_this_month, stats.points_issued_previous_month), t('client.stats.vsLastMonth'))}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className={cx(cardPadded, 'space-y-4')}>
                    <label htmlFor="client-list-search" className="sr-only">
                        {t('client.search')}
                    </label>
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            id="client-list-search"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('client.searchWithCode')}
                            className={cx(inputLg, 'pl-12')}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-600 dark:text-ink-350">{t('client.filter.activity')}</span>
                        {(['today', 'week', 'month'] as const).map((value) => (
                            <ChipToggle key={value} active={activity === value} onClick={() => setActivity(activity === value ? '' : value)}>
                                {t(`client.filter.activity.${value}`)}
                            </ChipToggle>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-600 dark:text-ink-350">{t('client.filter.loyalty')}</span>
                        <ChipToggle active={tierId === null} onClick={() => setTierId(null)}>
                            {t('client.filter.allTiers', { count: tierTotal })}
                        </ChipToggle>
                        {stats?.by_tier.map((tier) => (
                            <ChipToggle key={tier.id} active={tierId === tier.id} onClick={() => setTierId(tierId === tier.id ? null : tier.id)}>
                                {tier.name} {tier.count}
                            </ChipToggle>
                        ))}
                        <label className="ml-auto">
                            <span className="sr-only">{t('client.table.status')}</span>
                            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={cx(select, 'h-9 w-auto text-sm')}>
                                <option value="">{t('client.filter.allStatuses')}</option>
                                <option value="active">{t('client.activeStatus')}</option>
                                <option value="inactive">{t('client.inactive')}</option>
                            </select>
                        </label>
                    </div>
                </div>

                {stats && (
                    <div className={cx(cardPadded, 'space-y-3')}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.distribution.title')}</h2>
                                <p className="text-xs text-ink-600 dark:text-ink-350">{t('client.distribution.subtitle')}</p>
                            </div>
                            <span className="font-display text-xl font-bold tabular-nums text-ink-900 dark:text-white">{tierTotal}</span>
                        </div>
                        <ul className="space-y-2.5">
                            {stats.by_tier.map((tier, index) => {
                                const percent = tierTotal > 0 ? Math.round((tier.count / tierTotal) * 100) : 0;
                                return (
                                    <li key={tier.id} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-medium text-ink-800 dark:text-ink-100">{tier.name}</span>
                                            <span className="tabular-nums font-semibold text-ink-900 dark:text-white">{percent} %</span>
                                        </div>
                                        <ProgressBar value={tier.count} max={Math.max(1, tierTotal)} barClassName={TIER_BARS[index % TIER_BARS.length]} />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            <div className={cx(card, 'overflow-hidden')}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/80 px-5 py-4 dark:border-ink-800">
                    <div>
                        <h2 className={sectionTitle}>{t('client.directory.title')}</h2>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('client.directory.count', { count: meta.total })}</p>
                    </div>
                    <button type="button" onClick={() => void exportExcel()} disabled={exporting} className={button('secondary', 'sm')}>
                        {exporting ? <Spinner className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />}
                        {t('dashboard.export')}
                    </button>
                </div>
                {loading ? (
                    <LoadingState />
                ) : clients.length === 0 ? (
                    <EmptyState icon={Users} title={t('client.noResults')} description={t('client.noResultsHint')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[1120px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="min-w-[200px] flex-1">{t('client.table.identity')}</span>
                                <span className="w-32 shrink-0">{t('client.phone')}</span>
                                <span className="w-28 shrink-0">{t('client.table.agency')}</span>
                                <span className="w-32 shrink-0">{t('client.table.lastOrder')}</span>
                                <span className="w-20 shrink-0">{t('client.table.frequency')}</span>
                                <span className="w-28 shrink-0 text-right">{t('client.table.value')}</span>
                                <span className="w-16 shrink-0 text-right">{t('client.table.points')}</span>
                                <span className="w-24 shrink-0">{t('client.table.tier')}</span>
                                <span className="w-20 shrink-0">{t('client.table.status')}</span>
                                <span className="w-10 shrink-0" aria-hidden="true" />
                            </div>
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {clients.map((client) => (
                                    <li key={client.id} className="flex items-center gap-4 px-5 py-3 text-sm transition hover:bg-ink-50 dark:hover:bg-ink-800/50">
                                        <Link to={`/clients/${client.id}`} className="flex min-w-[200px] flex-1 items-center gap-3">
                                            <Avatar firstName={client.first_name} lastName={client.last_name} size="sm" />
                                            <span className="min-w-0">
                                                <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">
                                                    {client.first_name} {client.last_name}
                                                </span>
                                                <span className="block text-xs text-ink-500 dark:text-ink-400">{client.client_code}</span>
                                            </span>
                                        </Link>
                                        <span className="w-32 shrink-0 truncate tabular-nums text-ink-700 dark:text-ink-200">{client.phone}</span>
                                        <span className="w-28 shrink-0 truncate text-ink-700 dark:text-ink-200">{client.agency?.name ?? '—'}</span>
                                        <span className="w-32 shrink-0 text-ink-700 dark:text-ink-200">{client.last_order_at ? dateTime(client.last_order_at) : '—'}</span>
                                        <span className="w-20 shrink-0 tabular-nums text-ink-700 dark:text-ink-200">{t('client.perMonth', { count: client.orders_per_month ?? 0 })}</span>
                                        <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-ink-900 dark:text-white">{money(client.lifetime_value ?? 0)}</span>
                                        <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-accent-700 dark:text-accent-300">{client.loyalty_points}</span>
                                        <span className="w-24 shrink-0">{tierName(client.tier_id) ? <Pill tone="accent">{tierName(client.tier_id)}</Pill> : '—'}</span>
                                        <span className="w-20 shrink-0">
                                            {client.is_active ? <Pill tone="emerald">{t('client.activeStatus')}</Pill> : <Pill tone="rose">{t('client.inactive')}</Pill>}
                                        </span>
                                        <Link to={`/clients/${client.id}/edit`} className={cx(button('ghost', 'sm'), 'w-10 shrink-0 px-0')} aria-label={t('common.edit')}>
                                            <Pencil aria-hidden="true" className="h-4 w-4" />
                                        </Link>
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
