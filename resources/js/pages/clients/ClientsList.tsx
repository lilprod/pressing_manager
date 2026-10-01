import { useEffect, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import type { Client, ClientStats, Paginated } from '../../types';
import { Link } from 'react-router-dom';
import { ChevronRight, Gem, Pencil, Search, Sparkles, UserPlus, Users, UserRoundPlus } from 'lucide-react';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { button, card, cx, inputLg } from '../../components/ui/styles';

export default function ClientsList() {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [stats, setStats] = useState<ClientStats | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Client>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        api
            .get<Paginated<Client>>(`/clients?${params}`)
            .then((res) => {
                setClients(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [page]);

    useEffect(() => {
        api.get<ClientStats>('/clients/stats').then(setStats).catch(() => setStats(null));
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (page === 1) reload();
            else setPage(1);
        }, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

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

            {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label={t('client.stats.active')} value={stats.active_count} icon={Users} tone="brand" />
                    <StatCard label={t('client.stats.newThisMonth')} value={stats.new_this_month} icon={UserRoundPlus} tone="emerald" />
                    <StatCard label={t('client.stats.vip')} value={stats.vip_count} icon={Gem} tone="accent" hint={t('client.stats.vipHint')} />
                    <StatCard label={t('client.stats.pointsIssued')} value={stats.points_issued} icon={Sparkles} tone="amber" />
                </div>
            )}

            <div className="space-y-4">
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
                        placeholder={t('client.search')}
                        className={cx(inputLg, 'pl-12')}
                    />
                </div>

                <div className={cx(card, 'overflow-hidden')}>
                    {loading ? (
                        <LoadingState />
                    ) : clients.length === 0 ? (
                        <EmptyState icon={Users} title={t('client.noResults')} description={t('client.noResultsHint')} />
                    ) : (
                        <div>
                            <div
                                role="row"
                                className="hidden items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="w-10 shrink-0" aria-hidden="true" />
                                <span className="min-w-0 flex-1">{t('client.table.identity')}</span>
                                <span className="w-36 shrink-0">{t('client.table.tier')}</span>
                                <span className="w-24 shrink-0">{t('client.table.status')}</span>
                                <span className="w-20 shrink-0" aria-hidden="true" />
                            </div>

                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {clients.map((client) => (
                                    <li key={client.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-ink-50 sm:flex-nowrap sm:gap-4 sm:px-5 dark:hover:bg-ink-800/50">
                                        <Link
                                            to={`/clients/${client.id}`}
                                            className="flex min-w-0 basis-full items-center gap-3 text-left sm:flex-1 sm:basis-auto"
                                        >
                                            <Avatar firstName={client.first_name} lastName={client.last_name} size="sm" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">
                                                    {client.first_name} {client.last_name}
                                                </span>
                                                <span className="flex flex-wrap gap-x-3 text-sm text-ink-600 dark:text-ink-350">
                                                    <span>{client.phone}</span>
                                                    {client.email && <span className="hidden truncate sm:inline">{client.email}</span>}
                                                </span>
                                            </span>
                                            <ChevronRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
                                        </Link>

                                        <div className="w-auto shrink-0 sm:w-36">
                                            {client.loyalty_tier_name ? (
                                                <Pill tone="accent">{client.loyalty_tier_name}</Pill>
                                            ) : (
                                                <span className="hidden text-sm text-ink-500 sm:inline dark:text-ink-400">—</span>
                                            )}
                                        </div>

                                        <div className="w-auto shrink-0 sm:w-24">
                                            {client.is_active ? (
                                                <Pill tone="emerald">{t('client.activeStatus')}</Pill>
                                            ) : (
                                                <Pill tone="rose">{t('client.inactive')}</Pill>
                                            )}
                                        </div>

                                        <Link to={`/clients/${client.id}/edit`} className={cx(button('ghost', 'sm'), 'w-auto shrink-0 sm:w-20')}>
                                            <Pencil aria-hidden="true" className="h-4 w-4" />
                                            <span className="hidden sm:inline">{t('common.edit')}</span>
                                            <span className="sr-only sm:hidden">{t('common.edit')}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <Pagination meta={meta} onPageChange={setPage} />
                </div>
            </div>
        </div>
    );
}
