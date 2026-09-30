import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Pencil, Plus, Search } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, inputLg } from '../../components/ui/styles';
import type { Agency, Paginated } from '../../types';

export default function AgenciesPage() {
    const { t } = useI18n();

    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Agency>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        api
            .get<Paginated<Agency>>(`/agencies/manage?${params}`)
            .then((res) => {
                setAgencies(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [page]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('agency.title')}
                subtitle={t('agency.subtitle')}
                icon={Building2}
                actions={
                    <Link to="/agencies/new" className={button('primary')}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('agency.new')}
                    </Link>
                }
            />

            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('agency.search')}
                    className={cx(inputLg, 'pl-12')}
                />
            </div>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : agencies.length === 0 ? (
                    <EmptyState icon={Building2} title={t('agency.none')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div
                            role="row"
                            className="hidden min-w-[760px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                        >
                            <span className="min-w-0 flex-1">{t('agency.table.agency')}</span>
                            <span className="w-28 shrink-0">{t('agency.table.city')}</span>
                            <span className="w-20 shrink-0 text-right">{t('agency.table.users')}</span>
                            <span className="w-20 shrink-0 text-right">{t('agency.table.clients')}</span>
                            <span className="w-24 shrink-0">{t('agency.table.status')}</span>
                            <span className="w-32 shrink-0">{t('agency.table.actions')}</span>
                        </div>

                        <ul className="divide-y divide-ink-100 sm:min-w-[760px] dark:divide-ink-800">
                            {agencies.map((agency) => (
                                <li key={agency.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:gap-4 sm:px-5">
                                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                                        <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{agency.name}</p>
                                        <p className="text-sm text-ink-600 dark:text-ink-350">
                                            {agency.code}
                                            {agency.phone && <> · {agency.phone}</>}
                                        </p>
                                    </div>

                                    <div className="w-auto shrink-0 sm:w-28">
                                        <span className="text-sm text-ink-700 dark:text-ink-200">{agency.city ?? '—'}</span>
                                    </div>

                                    <div className="w-auto shrink-0 text-left tabular-nums sm:w-20 sm:text-right">
                                        <span className="text-sm text-ink-700 dark:text-ink-200">{agency.users_count ?? '—'}</span>
                                    </div>

                                    <div className="w-auto shrink-0 text-left tabular-nums sm:w-20 sm:text-right">
                                        <span className="text-sm text-ink-700 dark:text-ink-200">{agency.clients_count ?? '—'}</span>
                                    </div>

                                    <div className="w-auto shrink-0 sm:w-24">
                                        {agency.is_active ? <Pill tone="emerald">{t('agency.active')}</Pill> : <Pill tone="rose">{t('agency.inactive')}</Pill>}
                                    </div>

                                    <div className="w-auto shrink-0 sm:w-32">
                                        <Link to={`/agencies/${agency.id}/edit`} className={button('ghost', 'sm')}>
                                            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                            {t('common.edit')}
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}
