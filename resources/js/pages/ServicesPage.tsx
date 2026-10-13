import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api } from '../lib/api';
import Toggle from '../components/ui/Toggle';
import { EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import Pagination from '../components/ui/Pagination';
import { Pill, TONES } from '../components/ui/StatusBadge';
import { button, card, cx, input, inputSm, select, textLink } from '../components/ui/styles';
import { StatCard, ChipToggle, percentChange, trend } from '../components/ui/Metrics';
import { Copy, Download, History, Info, Layers, MoreVertical, Pencil, Plus, Search, Shirt, SlidersHorizontal, TrendingUp, TriangleAlert, Upload } from 'lucide-react';
import { categoryLabel, categoryMeta } from '../lib/serviceCategory';
import type { Paginated, Service, ServiceBillingMode, ServiceStats, ServicePriceHistory, TreatmentType } from '../types';

const BILLING_MODES: ServiceBillingMode[] = ['piece', 'kg', 'mixte'];
const SORTS = ['name', 'updated_at', 'base_price'] as const;
/** Seuil de la puce « Disponible dans N+ agences ». */
const MIN_AGENCIES = 3;
type Sort = (typeof SORTS)[number];
type Tab = 'all' | 'categories' | 'kg' | 'unavailable' | 'history';

export default function ServicesPage() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { user, activeAgencyId, agencies } = useAuth();
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
    const [category, setCategory] = useState<string>('');
    const [billingMode, setBillingMode] = useState<ServiceBillingMode | ''>('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<Sort>('name');
    const [tab, setTab] = useState<Tab>('all');
    const [agencyFilter, setAgencyFilter] = useState('');
    const [minAgencies, setMinAgencies] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [loading, setLoading] = useState(true);
    // Familles d'articles réellement utilisées par le pressing (catégories libres).
    const [categories, setCategories] = useState<string[]>([]);
    useEffect(() => {
        api.get<string[]>('/services/categories').then(setCategories).catch(() => setCategories([]));
    }, []);
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
        if (agencyFilter) params.set('available_in_agency', agencyFilter);
        if (minAgencies) params.set('min_agencies', String(MIN_AGENCIES));
        api
            .get<Paginated<Service>>(`/services/catalog?${params}`)
            .then((res) => {
                setServices(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [agencyId, page, category, billingMode, sort, tab, agencyFilter, minAgencies]);

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

    const gridCols = `minmax(220px,2fr) minmax(130px,1fr) ${treatmentTypes.map(() => 'minmax(90px,0.7fr)').join(' ')} minmax(150px,1fr) 170px`;
    const priceDelta = stats ? percentChange(stats.average_base_price, stats.average_base_price_30d_ago) : null;

    const groupedByCategory =
        tab === 'categories'
            ? categories.map((c) => ({ category: c, items: services.filter((s) => s.category === c) })).filter((g) => g.items.length > 0)
            : null;

    const modeTone: Record<ServiceBillingMode, 'neutral' | 'sky' | 'amber'> = { piece: 'neutral', kg: 'sky', mixte: 'amber' };
    const TABS: Tab[] = ['all', 'categories', 'kg', 'unavailable', 'history'];
    const activeFilters = Boolean(category || billingMode || agencyFilter || minAgencies || search);

    const table = (rows: Service[]) => (
        <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
                <div
                    role="row"
                    className="grid items-center gap-3 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                    style={{ gridTemplateColumns: gridCols }}
                >
                    <span>{t('service.table.article')}</span>
                    <span>{t('service.table.categoryMode')}</span>
                    {treatmentTypes.map((tt) => (
                        <span key={tt.id} className="text-right">
                            {tt.name}
                        </span>
                    ))}
                    <span>{t('service.table.statusScope')}</span>
                    <span>{t('service.table.actions')}</span>
                </div>
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {rows.map((service) => (
                        <ServiceRow
                            key={service.id}
                            service={service}
                            agencyId={agencyId}
                            treatmentTypes={treatmentTypes}
                            gridCols={gridCols}
                            modeTone={modeTone}
                            onChanged={reload}
                            onDuplicate={() => void duplicateService(service)}
                        />
                    ))}
                </ul>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('service.title')}</h1>
                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('service.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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

            <div className={cx(card, 'px-5 pt-4')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-ink-900 dark:text-ink-50">{t('service.catalogCard.title')}</p>
                        {stats?.catalog_updated_at && (
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.catalogCard.updatedAt', { date: dateTime(stats.catalog_updated_at) })}</p>
                        )}
                    </div>
                    <Pill tone="neutral">{t('service.catalogCard.count', { count: stats ? stats.active_count : meta.total })}</Pill>
                </div>
                <div role="tablist" className="mt-3 flex gap-5 overflow-x-auto">
                    {TABS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            onClick={() => {
                                setTab(key);
                                setPage(1);
                            }}
                            className={cx(
                                '-mb-px shrink-0 border-b-2 pb-2.5 text-sm font-semibold transition',
                                tab === key ? 'border-brand-700 text-brand-800 dark:border-brand-300 dark:text-brand-200' : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400',
                            )}
                        >
                            {t(`service.tab.${key}`)}
                        </button>
                    ))}
                </div>
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
                                                : entry.field === 'treatment_rates'
                                                  ? t('service.historyTreatmentRates')
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
                    <div className={cx(card, 'space-y-3 p-4')}>
                        <div className="flex flex-wrap gap-2">
                            <div className="relative min-w-0 flex-1 basis-full md:basis-auto">
                                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('service.search')}
                                    aria-label={t('service.search')}
                                    className={cx(input, 'w-full pl-9')}
                                />
                            </div>
                            <select aria-label={t('service.allCategories')} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={cx(select, 'min-w-0 flex-1 sm:w-48 sm:flex-none')}>
                                <option value="">{t('service.allCategories')}</option>
                                {categories.map((c) => (
                                    <option key={c} value={c}>
                                        {categoryLabel(c, t)}
                                    </option>
                                ))}
                            </select>
                            {tab !== 'kg' && (
                                <select aria-label={t('service.filter.modeSelect')} value={billingMode} onChange={(e) => { setBillingMode(e.target.value as ServiceBillingMode | ''); setPage(1); }} className={cx(select, 'min-w-0 flex-1 sm:w-44 sm:flex-none')}>
                                    <option value="">{t('service.filter.modeSelect')}</option>
                                    {BILLING_MODES.map((mode) => (
                                        <option key={mode} value={mode}>
                                            {t(`service.billingModeOption.${mode}`)}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <select aria-label={t('service.filter.allAgencies')} value={agencyFilter} onChange={(e) => { setAgencyFilter(e.target.value); setPage(1); }} className={cx(select, 'min-w-0 flex-1 sm:w-48 sm:flex-none')}>
                                <option value="">{t('service.filter.allAgencies')}</option>
                                {agencies.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                            <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className={button(showMore ? 'primary' : 'secondary', 'md')}>
                                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                                {t('service.filter.more')}
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {tab !== 'kg' && (
                                <>
                                    <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">{t('service.filter.modes')}</span>
                                    {BILLING_MODES.map((mode) => (
                                        <ChipToggle key={mode} active={billingMode === mode} onClick={() => { setBillingMode(billingMode === mode ? '' : mode); setPage(1); }}>
                                            {t(`service.billingModeOption.${mode}`)}
                                        </ChipToggle>
                                    ))}
                                </>
                            )}
                            <ChipToggle active={minAgencies} onClick={() => { setMinAgencies((v) => !v); setPage(1); }}>
                                {t('service.filter.minAgencies', { count: MIN_AGENCIES })}
                            </ChipToggle>
                            {activeFilters && (
                                <button type="button" onClick={() => { setCategory(''); setBillingMode(''); setAgencyFilter(''); setMinAgencies(false); setSearch(''); }} className={cx(textLink, 'text-xs')}>
                                    {t('service.filter.reset')}
                                </button>
                            )}
                        </div>
                        {showMore && (
                            <label className="flex items-center gap-2 border-t border-ink-100 pt-3 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-350">
                                {t('service.sortBy')}
                                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={inputSm}>
                                    {SORTS.map((s) => (
                                        <option key={s} value={s}>
                                            {t(`service.sortOption.${s}`)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                        <span>{t('service.sortShort')}</span>
                        <span className="font-semibold text-ink-700 dark:text-ink-200">{t(`service.sortOption.${sort}`)}</span>
                    </div>

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
                                        {categoryLabel(group.category, t)} ({group.items.length})
                                    </div>
                                    {table(group.items)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={cx(card, 'overflow-hidden')}>
                            {table(services)}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-5 py-2 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                                <span>{t('service.results', { count: services.length, total: meta.total })}</span>
                            </div>
                            <Pagination meta={meta} onPageChange={setPage} />
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900 dark:bg-brand-400/10 dark:text-brand-100">
                        <span className="flex min-w-0 items-start gap-2">
                            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                            {t('service.footerInfo')}
                        </span>
                        <Link to="/services/treatment-types" className="font-semibold underline-offset-2 hover:underline">
                            {t('service.viewRules')}
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
}

function ServiceRow({
    service,
    agencyId,
    treatmentTypes,
    gridCols,
    modeTone,
    onChanged,
    onDuplicate,
}: {
    service: Service;
    agencyId: number | null;
    treatmentTypes: TreatmentType[];
    gridCols: string;
    modeTone: Record<ServiceBillingMode, 'neutral' | 'sky' | 'amber'>;
    onChanged: () => void;
    onDuplicate: () => void;
}) {
    const { t } = useI18n();
    const { money } = useFormat();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    async function toggleActive() {
        setBusy(true);
        try {
            await api.patch(`/services/${service.id}`, { is_active: !service.is_active });
            onChanged();
        } finally {
            setBusy(false);
        }
    }

    async function toggleAgencyActive() {
        if (!agencyId) return;
        await api.patch(`/agencies/${agencyId}/services/${service.id}`, { is_active: !(service.agency_pivot?.is_active ?? true) });
        setMenuOpen(false);
        onChanged();
    }

    const agencyActive = service.agency_pivot?.is_active ?? true;
    const meta = categoryMeta(service.category);
    const Icon = meta.icon;
    const available = service.available_agencies_count ?? 0;
    const scope =
        available === 0
            ? t('service.scope.none')
            : service.single_agency_name
              ? service.single_agency_name
              : service.total_agencies_count && available >= service.total_agencies_count
                ? t('service.availability.all', { total: service.total_agencies_count })
                : t('service.scope.agencies', { count: available });

    const priceCell = (tt: TreatmentType) => {
        if (service.billing_mode === 'kg') {
            const v = service.treatment_prices_per_kg?.[tt.code];
            return v !== undefined ? t('service.perKgShort', { amount: v.toLocaleString('fr-FR') }) : '—';
        }
        const v = service.treatment_prices?.[tt.code];
        return v !== undefined && v !== null ? v.toLocaleString('fr-FR') : '—';
    };

    return (
        <li className="grid items-center gap-3 px-5 py-3" style={{ gridTemplateColumns: gridCols }}>
            <Link to={`/services/${service.id}/edit`} className="flex min-w-0 items-center gap-3">
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', TONES[meta.tone])}>
                    <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">{service.name}</span>
                    <span className="block text-xs text-ink-500 dark:text-ink-400">{service.code}</span>
                </span>
            </Link>
            <div className="flex min-w-0 flex-col items-start gap-1">
                <span className="truncate text-sm text-ink-700 dark:text-ink-200">{categoryLabel(service.category, t)}</span>
                <span className="flex flex-wrap gap-1">
                    <Pill tone={modeTone[service.billing_mode]}>{t(`service.billingModeOption.${service.billing_mode}`)}</Pill>
                    {service.has_draft && <Pill tone="amber">{t('service.draft.badge')}</Pill>}
                </span>
            </div>
            {treatmentTypes.map((tt) => (
                <span key={tt.id} className="text-right text-sm tabular-nums text-ink-800 dark:text-ink-100">
                    {priceCell(tt)}
                </span>
            ))}
            <div className="flex min-w-0 flex-col items-start gap-1">
                <span className="flex flex-wrap gap-1">
                    {service.is_active ? <Pill tone="emerald">{t('service.active')}</Pill> : <Pill tone="neutral">{t('service.inactive')}</Pill>}
                    {agencyId && !agencyActive && <Pill tone="amber">{t('service.inactiveForAgency')}</Pill>}
                </span>
                <span className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {scope}
                    {(service.local_price_count ?? 0) > 0 && ` · ${t('service.scope.localPrice')}`}
                </span>
            </div>
            <div className="relative flex items-center gap-1">
                <Toggle className="shrink-0" checked={service.is_active} disabled={busy} onChange={() => void toggleActive()} label={<span className="sr-only">{t('service.toggleActive', { name: service.name })}</span>} />
                <Link to={`/services/${service.id}/edit`} className={button('ghost', 'sm', 'px-2')} aria-label={t('common.edit')} title={t('common.edit')}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                </Link>
                <button type="button" onClick={onDuplicate} className={button('ghost', 'sm', 'px-2')} aria-label={t('service.duplicate')} title={t('service.duplicate')}>
                    <Copy aria-hidden="true" className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label={t('service.rowMenu')} className={button('ghost', 'sm', 'px-2')}>
                    <MoreVertical aria-hidden="true" className="h-4 w-4" />
                </button>
                {menuOpen && (
                    <div role="menu" className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-ink-200 bg-white p-1 text-sm shadow-lg dark:border-ink-700 dark:bg-ink-900">
                        <button type="button" role="menuitem" onClick={() => navigate(`/services/${service.id}/edit?history=1`)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800">
                            {t('service.viewHistory')}
                        </button>
                        {agencyId && (
                            <button type="button" role="menuitem" onClick={() => void toggleAgencyActive()} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800">
                                {agencyActive ? t('service.deactivateForAgency') : t('service.activateForAgency')}
                            </button>
                        )}
                        <span className="block px-3 py-1.5 text-xs text-ink-500">{money(service.base_price ?? 0)}</span>
                    </div>
                )}
            </div>
        </li>
    );
}
