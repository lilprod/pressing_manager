import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import Pagination from '../components/ui/Pagination';
import { Pill, TONES } from '../components/ui/StatusBadge';
import { button, card, cx, inputLg, inputSm } from '../components/ui/styles';
import { Layers, Pencil, Plus, Search, Shirt, TrendingUp, TriangleAlert } from 'lucide-react';
import { StatCard } from '../components/ui/Metrics';
import { categoryMeta } from '../lib/serviceCategory';
import type { Paginated, Service, ServiceCategory, ServiceStats } from '../types';

const CATEGORIES: ServiceCategory[] = ['nettoyage', 'lavage', 'repassage', 'retouche', 'teinture', 'autre'];

export default function ServicesPage() {
    const { t } = useI18n();
    const { money } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [services, setServices] = useState<Service[]>([]);
    const [stats, setStats] = useState<ServiceStats | null>(null);
    const [meta, setMeta] = useState<Pick<Paginated<Service>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState<ServiceCategory | ''>('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get<ServiceStats>('/services/stats').then(setStats).catch(() => setStats(null));
    }, []);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (agencyId) params.set('agency_id', String(agencyId));
        if (category) params.set('category', category);
        if (search) params.set('search', search);
        api
            .get<Paginated<Service>>(`/services/catalog?${params}`)
            .then((res) => {
                setServices(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [agencyId, page, category]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeader title={t('service.title')} subtitle={t('service.subtitle')} icon={Shirt} />
                <Link to="/services/new" className={button('primary', 'md')}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {t('service.new')}
                </Link>
            </div>

            {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label={t('service.stats.active')} value={stats.active_count} icon={Shirt} tone="brand" />
                    <StatCard label={t('service.stats.categories')} value={stats.category_count} icon={Layers} tone="sky" />
                    <StatCard label={t('service.stats.averagePrice')} value={money(stats.average_base_price)} icon={TrendingUp} tone="emerald" />
                    <StatCard label={t('service.stats.stale')} value={stats.stale_count} icon={TriangleAlert} tone="amber" hint={t('service.stats.staleHint')} />
                </div>
            )}

            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('service.search')}
                    className={cx(inputLg, 'pl-12')}
                />
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => {
                        setCategory('');
                        setPage(1);
                    }}
                    className={cx(
                        'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition duration-150',
                        category === ''
                            ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                            : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
                    )}
                >
                    {t('service.allCategories')}
                </button>
                {CATEGORIES.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => {
                            setCategory(c);
                            setPage(1);
                        }}
                        className={cx(
                            'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition duration-150',
                            category === c
                                ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                                : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
                        )}
                    >
                        {t(`service.category.${c}`)}
                    </button>
                ))}
            </div>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : services.length === 0 ? (
                    <EmptyState icon={Shirt} title={t('service.none')} />
                ) : (
                    <div className="overflow-x-auto">
                        <div
                            role="row"
                            className="hidden min-w-[760px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                        >
                            <span className="w-9 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1">{t('service.table.article')}</span>
                            <span className="w-28 shrink-0">{t('service.categoryLabel')}</span>
                            <span className="w-28 shrink-0 text-right">{t('service.table.price')}</span>
                            <span className="w-24 shrink-0">{t('service.table.status')}</span>
                            <span className="w-44 shrink-0">{t('service.table.actions')}</span>
                        </div>

                        <ul className="divide-y divide-ink-100 sm:min-w-[760px] dark:divide-ink-800">
                            {services.map((service) => (
                                <ServiceRow key={service.id} service={service} agencyId={agencyId} onChanged={reload} />
                            ))}
                        </ul>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}

function ServiceRow({
    service,
    agencyId,
    onChanged,
}: {
    service: Service;
    agencyId: number | null;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [override, setOverride] = useState(service.agency_pivot?.price_override?.toString() ?? '');
    const [busy, setBusy] = useState(false);

    async function toggleActive() {
        await api.patch(`/services/${service.id}`, { is_active: !service.is_active });
        onChanged();
    }

    async function toggleAgencyActive() {
        if (!agencyId) return;
        await api.patch(`/agencies/${agencyId}/services/${service.id}`, { is_active: !(service.agency_pivot?.is_active ?? true) });
        onChanged();
    }

    async function saveOverride() {
        if (!agencyId) return;
        setBusy(true);
        try {
            await api.patch(`/agencies/${agencyId}/services/${service.id}`, {
                price_override: override === '' ? null : Number(override),
            });
            onChanged();
        } finally {
            setBusy(false);
        }
    }

    const agencyActive = service.agency_pivot?.is_active ?? true;
    const meta = categoryMeta(service.category);
    const Icon = meta.icon;

    return (
        <li className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap sm:items-center sm:gap-4 sm:px-5">
            <span className={cx('hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:flex', TONES[meta.tone])}>
                <Icon aria-hidden="true" className="h-4 w-4" />
            </span>

            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{service.name}</p>
                <p className="text-sm text-ink-600 dark:text-ink-350">
                    {service.code} · {t('service.durationHours', { count: service.estimated_duration_hours })}
                </p>
            </div>

            <div className="flex w-auto shrink-0 flex-col items-start gap-1 sm:w-28">
                <Pill tone="neutral">{t(`service.category.${service.category}`)}</Pill>
                {service.billing_mode !== 'piece' && <Pill tone="violet">{t(`service.billingModeOption.${service.billing_mode}`)}</Pill>}
            </div>

            <div className="w-auto shrink-0 text-left sm:w-28 sm:text-right">
                {service.billing_mode === 'kg' ? (
                    <span className="text-sm text-ink-600 dark:text-ink-350">
                        {service.price_tiers && service.price_tiers.length > 0
                            ? t('service.fromPerKg', { amount: money(service.price_tiers[0].price_per_kg) })
                            : '—'}
                    </span>
                ) : agencyId ? (
                    <label className="inline-flex items-center gap-1.5">
                        <span className="sr-only">{t('service.priceOverride')}</span>
                        <input
                            type="number"
                            min={0}
                            value={override}
                            onBlur={() => void saveOverride()}
                            onChange={(e) => setOverride(e.target.value)}
                            placeholder={String(service.base_price ?? '')}
                            className={cx(inputSm, 'h-8 w-24 text-right tabular-nums')}
                        />
                        {busy && <Spinner className="h-3.5 w-3.5 shrink-0" />}
                    </label>
                ) : (
                    <span className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(service.base_price)}</span>
                )}
            </div>

            <div className="flex w-auto shrink-0 flex-col items-start gap-1 sm:w-24">
                {service.is_active ? <Pill tone="emerald">{t('service.active')}</Pill> : <Pill tone="rose">{t('service.inactive')}</Pill>}
                {agencyId && !agencyActive && <Pill tone="amber">{t('service.inactiveForAgency')}</Pill>}
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-44">
                <Link to={`/services/${service.id}/edit`} className={button('secondary', 'sm')}>
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('common.edit')}
                </Link>
                <button type="button" onClick={() => void toggleActive()} className={button('ghost', 'sm')}>
                    {service.is_active ? t('service.deactivate') : t('service.activate')}
                </button>
                {agencyId && (
                    <button type="button" onClick={() => void toggleAgencyActive()} className={button('ghost', 'sm')}>
                        {agencyActive ? t('service.deactivateForAgency') : t('service.activateForAgency')}
                    </button>
                )}
            </div>
        </li>
    );
}

