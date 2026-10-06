import { useEffect, useRef, useState, type ChangeEvent } from 'react';
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
import { StatCard, ChipToggle, percentChange, trend } from '../components/ui/Metrics';
import { Download, Layers, Pencil, Plus, Search, Shirt, Sparkles, TrendingUp, TriangleAlert, Upload, Copy, History } from 'lucide-react';
import { categoryMeta } from '../lib/serviceCategory';
import type { Paginated, Service, ServiceCategory, ServiceBillingMode, ServiceStats, ServicePriceHistory, TreatmentType } from '../types';

const CATEGORIES: ServiceCategory[] = ['nettoyage', 'lavage', 'repassage', 'retouche', 'teinture', 'autre'];
const BILLING_MODES: ServiceBillingMode[] = ['piece', 'kg', 'mixte'];
const SORTS = ['name', 'updated_at', 'base_price'] as const;
type Sort = (typeof SORTS)[number];
type Tab = 'all' | 'categories' | 'kg' | 'unavailable' | 'history';

export default function ServicesPage() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [services, setServices] = useState<Service[]>([]);
    const [stats, setStats] = useState<ServiceStats | null>(null);
    const [treatmentTypes, setTreatmentTypes] = useState<TreatmentType[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Service>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState<ServiceCategory | ''>('');
    const [billingMode, setBillingMode] = useState<ServiceBillingMode | ''>('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<Sort>('name');
    const [tab, setTab] = useState<Tab>('all');
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [importErrors, setImportErrors] = useState<Array<{ row: number; errors: string[] }> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [history, setHistory] = useState<ServicePriceHistory[]>([]);
    const [historyMeta, setHistoryMeta] = useState<Pick<Paginated<ServicePriceHistory>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [historyPage, setHistoryPage] = useState(1);

    useEffect(() => {
        api.get<ServiceStats>('/services/stats').then(setStats).catch(() => setStats(null));
        api.get<TreatmentType[]>('/treatment-types').then((list) => setTreatmentTypes(list.filter((t) => t.is_active))).catch(() => setTreatmentTypes([]));
    }, []);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), sort });
        if (agencyId) params.set('agency_id', String(agencyId));
        if (category) params.set('category', category);
        if (tab === 'kg') params.set('billing_mode', 'kg');
        else if (billingMode) params.set('billing_mode', billingMode);
        if (tab === 'unavailable') params.set('only_unavailable', '1');
        if (tab === 'categories') params.set('per_page', '100');
        if (search) params.set('search', search);
        api
            .get<Paginated<Service>>(`/services/catalog?${params}`)
            .then((res) => {
                setServices(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [agencyId, page, category, billingMode, sort, tab]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        if (tab !== 'history') return;
        api
            .get<Paginated<ServicePriceHistory>>(`/services/price-history?page=${historyPage}`)
            .then((res) => {
                setHistory(res.data);
                setHistoryMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch(() => setHistory([]));
    }, [tab, historyPage]);

    async function exportCatalog() {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (billingMode) params.set('billing_mode', billingMode);
        if (search) params.set('search', search);
        const blob = await api.blob(`/services/export?${params}`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `catalogue-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setImporting(true);
        setImportErrors(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const result = await api.postForm<{ created: number; errors: Array<{ row: number; errors: string[] }> }>('/services/import', formData);
            if (result.errors.length > 0) {
                setImportErrors(result.errors);
            } else {
                reload();
                api.get<ServiceStats>('/services/stats').then(setStats).catch(() => {});
            }
        } catch {
            setImportErrors([{ row: 0, errors: [t('service.import.genericError')] }]);
        } finally {
            setImporting(false);
        }
    }

    async function duplicateService(service: Service) {
        await api.post(`/services/${service.id}/duplicate`);
        reload();
    }

    const priceDelta = stats ? percentChange(stats.average_base_price, stats.average_base_price_30d_ago) : null;

    const groupedByCategory =
        tab === 'categories'
            ? CATEGORIES.map((c) => ({ category: c, items: services.filter((s) => s.category === c) })).filter((g) => g.items.length > 0)
            : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeader title={t('service.title')} subtitle={t('service.subtitle')} icon={Shirt} />
                <div className="flex flex-wrap items-center gap-2">
                    <Link to="/services/treatment-types" className={button('ghost', 'md')}>
                        <Sparkles aria-hidden="true" className="h-4 w-4" />
                        {t('treatmentType.navLink')}
                    </Link>
                    <button type="button" onClick={() => void exportCatalog()} className={button('secondary', 'md')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {t('service.export')}
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className={button('secondary', 'md')}>
                        {importing ? <Spinner className="h-4 w-4" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
                        {t('service.import')}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void handleImportFile(e)} />
                    <Link to="/services/new" className={button('primary', 'md')}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('service.new')}
                    </Link>
                </div>
            </div>

            {importErrors && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                    <p className="font-semibold">{t('service.import.errorsTitle')}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                        {importErrors.map((e, i) => (
                            <li key={i}>
                                {e.row > 0 ? t('service.import.rowError', { row: e.row }) : ''} {e.errors.join(' · ')}
                            </li>
                        ))}
                    </ul>
                    <button type="button" onClick={() => setImportErrors(null)} className={cx(button('ghost', 'sm'), 'mt-3')}>
                        {t('common.close')}
                    </button>
                </div>
            )}

            {stats && (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
                    <StatCard
                        label={t('service.stats.active')}
                        value={stats.active_count}
                        icon={Shirt}
                        tone="brand"
                        hint={t('service.stats.newThisMonth', { count: stats.created_this_month_count })}
                    />
                    <StatCard label={t('service.stats.categories')} value={stats.category_count} icon={Layers} tone="sky" />
                    <StatCard
                        label={t('service.stats.averagePrice')}
                        value={money(stats.average_base_price)}
                        icon={TrendingUp}
                        tone="emerald"
                        {...trend(priceDelta, t('service.stats.vs30d'))}
                    />
                    <StatCard label={t('service.stats.stale')} value={stats.stale_count} icon={TriangleAlert} tone="amber" hint={t('service.stats.staleHint')} />
                </div>
            )}

            <div className={cx(card, 'flex flex-wrap items-center justify-between gap-2 p-4')}>
                <div>
                    <p className="font-semibold text-ink-900 dark:text-ink-50">{t('service.catalogCard.title')}</p>
                    {stats?.catalog_updated_at && (
                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('service.catalogCard.updatedAt', { date: dateTime(stats.catalog_updated_at) })}</p>
                    )}
                </div>
                <p className="text-sm text-ink-600 dark:text-ink-350">{t('service.catalogCard.count', { count: meta.total })}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <ChipToggle active={tab === 'all'} onClick={() => setTab('all')}>
                    {t('service.tab.all')}
                </ChipToggle>
                <ChipToggle active={tab === 'categories'} onClick={() => setTab('categories')}>
                    {t('service.tab.categories')}
                </ChipToggle>
                <ChipToggle active={tab === 'kg'} onClick={() => setTab('kg')}>
                    {t('service.tab.kg')}
                </ChipToggle>
                <ChipToggle active={tab === 'unavailable'} onClick={() => setTab('unavailable')}>
                    {t('service.tab.unavailable')}
                </ChipToggle>
                <ChipToggle active={tab === 'history'} onClick={() => setTab('history')}>
                    {t('service.tab.history')}
                </ChipToggle>
            </div>

            {tab === 'history' ? (
                <div className={cx(card, 'overflow-hidden')}>
                    {history.length === 0 ? (
                        <EmptyState icon={History} title={t('service.priceHistory.empty')} />
                    ) : (
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {history.map((entry) => (
                                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{entry.service?.name ?? '—'}</p>
                                        <p className="text-sm text-ink-600 dark:text-ink-350">
                                            {entry.field === 'base_price'
                                                ? t('service.historyBasePrice', { old: entry.old_value ?? '—', new: entry.new_value ?? '—' })
                                                : t('service.historyTiers')}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm text-ink-500 dark:text-ink-400">
                                        <p>{dateTime(entry.changed_at)}</p>
                                        {entry.actor && <p>{entry.actor.name}</p>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Pagination meta={historyMeta} onPageChange={setHistoryPage} />
                </div>
            ) : (
                <>
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

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            <ChipToggle active={category === ''} onClick={() => setCategory('')}>
                                {t('service.allCategories')}
                            </ChipToggle>
                            {CATEGORIES.map((c) => (
                                <ChipToggle key={c} active={category === c} onClick={() => setCategory(c)}>
                                    {t(`service.category.${c}`)}
                                </ChipToggle>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-350">
                            {t('service.sortBy')}
                            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={inputSm}>
                                {SORTS.map((s) => (
                                    <option key={s} value={s}>
                                        {t(`service.sortOption.${s}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {tab !== 'kg' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('service.billingMode')} :</span>
                            <ChipToggle active={billingMode === ''} onClick={() => setBillingMode('')}>
                                {t('service.allBillingModes')}
                            </ChipToggle>
                            {BILLING_MODES.map((mode) => (
                                <ChipToggle key={mode} active={billingMode === mode} onClick={() => setBillingMode(mode)}>
                                    {t(`service.billingModeOption.${mode}`)}
                                </ChipToggle>
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div className={cx(card, 'overflow-hidden')}>
                            <LoadingState />
                        </div>
                    ) : services.length === 0 ? (
                        <div className={cx(card, 'overflow-hidden')}>
                            <EmptyState icon={Shirt} title={t('service.none')} />
                        </div>
                    ) : groupedByCategory ? (
                        <div className="space-y-6">
                            {groupedByCategory.map((group) => (
                                <div key={group.category} className={cx(card, 'overflow-hidden')}>
                                    <div className="border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 font-semibold text-ink-900 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-50">
                                        {t(`service.category.${group.category}`)} ({group.items.length})
                                    </div>
                                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {group.items.map((service) => (
                                            <ServiceRow
                                                key={service.id}
                                                service={service}
                                                agencyId={agencyId}
                                                treatmentTypes={treatmentTypes}
                                                onChanged={reload}
                                                onDuplicate={() => void duplicateService(service)}
                                            />
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={cx(card, 'overflow-hidden')}>
                            <div className="overflow-x-auto">
                                <div
                                    role="row"
                                    className="hidden min-w-[980px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                                >
                                    <span className="w-9 shrink-0" aria-hidden="true" />
                                    <span className="min-w-[160px] flex-1">{t('service.table.article')}</span>
                                    <span className="w-28 shrink-0">{t('service.categoryLabel')}</span>
                                    <span className="w-28 shrink-0 text-right">{t('service.table.price')}</span>
                                    <span className="w-48 shrink-0">{t('service.table.treatmentPrices')}</span>
                                    <span className="w-32 shrink-0">{t('service.table.availability')}</span>
                                    <span className="w-24 shrink-0">{t('service.table.status')}</span>
                                    <span className="w-44 shrink-0">{t('service.table.actions')}</span>
                                </div>

                                <ul className="divide-y divide-ink-100 sm:min-w-[980px] dark:divide-ink-800">
                                    {services.map((service) => (
                                        <ServiceRow
                                            key={service.id}
                                            service={service}
                                            agencyId={agencyId}
                                            treatmentTypes={treatmentTypes}
                                            onChanged={reload}
                                            onDuplicate={() => void duplicateService(service)}
                                        />
                                    ))}
                                </ul>
                            </div>
                            <Pagination meta={meta} onPageChange={setPage} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function ServiceRow({
    service,
    agencyId,
    treatmentTypes,
    onChanged,
    onDuplicate,
}: {
    service: Service;
    agencyId: number | null;
    treatmentTypes: TreatmentType[];
    onChanged: () => void;
    onDuplicate: () => void;
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
    const availabilityLabel =
        service.total_agencies_count && service.available_agencies_count !== undefined
            ? service.available_agencies_count === service.total_agencies_count
                ? t('service.availability.all', { total: service.total_agencies_count })
                : t('service.availability.partial', { count: service.available_agencies_count, total: service.total_agencies_count })
            : null;

    return (
        <li className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap sm:items-center sm:gap-4 sm:px-5">
            <span className={cx('hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:flex', TONES[meta.tone])}>
                <Icon aria-hidden="true" className="h-4 w-4" />
            </span>

            <div className="min-w-0 basis-full sm:min-w-[160px] sm:flex-1 sm:basis-auto">
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

            <div className="flex w-full shrink-0 flex-wrap gap-1.5 sm:w-48">
                {service.treatment_prices && treatmentTypes.length > 0
                    ? treatmentTypes.map((tt) =>
                          service.treatment_prices && tt.code in service.treatment_prices ? (
                              <span
                                  key={tt.code}
                                  className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                              >
                                  {tt.name} · {money(service.treatment_prices[tt.code])}
                              </span>
                          ) : null,
                      )
                    : <span className="text-sm text-ink-400 dark:text-ink-500">—</span>}
            </div>

            <div className="w-auto shrink-0 sm:w-32">
                {availabilityLabel && <span className="text-sm text-ink-600 dark:text-ink-350">{availabilityLabel}</span>}
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
                <button type="button" onClick={onDuplicate} title={t('service.duplicate')} className={button('ghost', 'sm')}>
                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
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
