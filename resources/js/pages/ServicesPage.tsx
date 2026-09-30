import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import Pagination from '../components/ui/Pagination';
import { Pill, TONES } from '../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, inputLg, inputSm, label, select, sectionTitle } from '../components/ui/styles';
import { Pencil, Plus, Search, Shirt, Sparkles, X } from 'lucide-react';
import { categoryMeta } from '../lib/serviceCategory';
import type { Paginated, Service, ServiceCategory } from '../types';

const CATEGORIES: ServiceCategory[] = ['nettoyage', 'lavage', 'repassage', 'retouche', 'teinture', 'autre'];

export default function ServicesPage() {
    const { t } = useI18n();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [services, setServices] = useState<Service[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Service>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState<ServiceCategory | ''>('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Service | null>(null);

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
            <PageHeader title={t('service.title')} subtitle={t('service.subtitle')} icon={Shirt} />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="space-y-4">
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
                                        <ServiceRow key={service.id} service={service} agencyId={agencyId} onChanged={reload} onEdit={() => setEditing(service)} />
                                    ))}
                                </ul>
                            </div>
                        )}
                        <Pagination meta={meta} onPageChange={setPage} />
                    </div>
                </div>

                <CreateServiceForm onCreated={reload} />
            </div>

            {editing && <EditServiceModal service={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
        </div>
    );
}

function ServiceRow({
    service,
    agencyId,
    onChanged,
    onEdit,
}: {
    service: Service;
    agencyId: number | null;
    onChanged: () => void;
    onEdit: () => void;
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

            <div className="w-auto shrink-0 sm:w-28">
                <Pill tone="neutral">{t(`service.category.${service.category}`)}</Pill>
            </div>

            <div className="w-auto shrink-0 text-left sm:w-28 sm:text-right">
                {agencyId ? (
                    <label className="inline-flex items-center gap-1.5">
                        <span className="sr-only">{t('service.priceOverride')}</span>
                        <input
                            type="number"
                            min={0}
                            value={override}
                            onBlur={() => void saveOverride()}
                            onChange={(e) => setOverride(e.target.value)}
                            placeholder={String(service.base_price)}
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
                <button type="button" onClick={onEdit} className={button('secondary', 'sm')}>
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    {t('common.edit')}
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

function CreateServiceForm({ onCreated }: { onCreated: () => void }) {
    const { t } = useI18n();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [category, setCategory] = useState<ServiceCategory>('autre');
    const [description, setDescription] = useState('');
    const [basePrice, setBasePrice] = useState('');
    const [durationHours, setDurationHours] = useState('24');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/services', {
                code,
                name,
                category,
                description: description || null,
                base_price: Number(basePrice),
                estimated_duration_hours: Number(durationHours),
            });
            setCode('');
            setName('');
            setCategory('autre');
            setDescription('');
            setBasePrice('');
            setDurationHours('24');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = code.trim() !== '' && name.trim() !== '' && basePrice !== '';

    return (
        <section aria-labelledby="service-create-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="service-create-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Sparkles aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('service.new')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="space-y-3">
                <label className="block">
                    <span className={label}>{t('service.code')}</span>
                    <input value={code} onChange={(e) => setCode(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <label className="block">
                    <span className={label}>{t('service.name')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <label className="block">
                    <span className={label}>{t('service.categoryLabel')}</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory)} className={cx(select, 'w-full')}>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {t(`service.category.${c}`)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className={label}>{t('common.notes')}</span>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>{t('service.basePrice')}</span>
                        <input type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('service.duration')}</span>
                        <input type="number" min={1} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={input} />
                    </label>
                </div>
                <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    {t('common.create')}
                </button>
            </div>
        </section>
    );
}

function EditServiceModal({ service, onClose, onSaved }: { service: Service; onClose: () => void; onSaved: () => void }) {
    const { t } = useI18n();
    const [name, setName] = useState(service.name);
    const [category, setCategory] = useState<ServiceCategory>(service.category);
    const [description, setDescription] = useState(service.description ?? '');
    const [basePrice, setBasePrice] = useState(String(service.base_price));
    const [durationHours, setDurationHours] = useState(String(service.estimated_duration_hours));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/services/${service.id}`, {
                name,
                category,
                description: description || null,
                base_price: Number(basePrice),
                estimated_duration_hours: Number(durationHours),
            });
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && basePrice !== '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <section className={cx(cardPadded, 'w-full max-w-lg space-y-4')}>
                <div className="flex items-center justify-between">
                    <h2 className={sectionTitle}>{t('service.edit')}</h2>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className={button('ghost', 'sm')}>
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
                {error && <Alert tone="error">{error}</Alert>}

                <label className="block">
                    <span className={label}>{t('service.name')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <label className="block">
                    <span className={label}>{t('service.categoryLabel')}</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory)} className={cx(select, 'w-full')}>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {t(`service.category.${c}`)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className={label}>{t('common.notes')}</span>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>{t('service.basePrice')}</span>
                        <input type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('service.duration')}</span>
                        <input type="number" min={1} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={input} />
                    </label>
                </div>

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className={button('secondary', 'md')}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        {t('common.save')}
                    </button>
                </div>
            </section>
        </div>
    );
}
