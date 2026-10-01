import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Coins, FileText, History, MapPin, Plus, Scale, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { categoryMeta } from '../../lib/serviceCategory';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill, TONES } from '../../components/ui/StatusBadge';
import { button, cardPadded, cx, input, inputSm, label, select, sectionTitle, textLink } from '../../components/ui/styles';
import type { Service, ServiceBillingMode, ServiceCategory, ServicePriceTier } from '../../types';

const CATEGORIES: ServiceCategory[] = ['nettoyage', 'lavage', 'repassage', 'retouche', 'teinture', 'autre'];
const BILLING_MODES: ServiceBillingMode[] = ['piece', 'kg', 'mixte'];

type TierDraft = { weight_min: string; weight_max: string; price_per_kg: string };

function emptyTier(): TierDraft {
    return { weight_min: '', weight_max: '', price_per_kg: '' };
}

export default function ServiceFormPage() {
    const { id } = useParams<{ id: string }>();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [service, setService] = useState<Service | null>(null);
    const [loading, setLoading] = useState(isEdit);
    const [notFound, setNotFound] = useState(false);

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [category, setCategory] = useState<ServiceCategory>('autre');
    const [billingMode, setBillingMode] = useState<ServiceBillingMode>('piece');
    const [description, setDescription] = useState('');
    const [basePrice, setBasePrice] = useState('');
    const [durationHours, setDurationHours] = useState('24');
    const [isActive, setIsActive] = useState(true);
    const [allowDiscount, setAllowDiscount] = useState(true);
    const [roundToHundred, setRoundToHundred] = useState(false);
    const [priceEditableAtCounter, setPriceEditableAtCounter] = useState(false);
    const [tiers, setTiers] = useState<TierDraft[]>([emptyTier()]);
    const [override, setOverride] = useState('');
    const [agencyActive, setAgencyActive] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!id) return;
        const params = new URLSearchParams();
        if (agencyId) params.set('agency_id', String(agencyId));
        api
            .get<Service>(`/services/${id}?${params}`)
            .then((s) => {
                setService(s);
                setCode(s.code);
                setName(s.name);
                setCategory(s.category);
                setBillingMode(s.billing_mode);
                setDescription(s.description ?? '');
                setBasePrice(s.base_price !== null ? String(s.base_price) : '');
                setDurationHours(String(s.estimated_duration_hours));
                setIsActive(s.is_active);
                setAllowDiscount(s.allow_discount);
                setRoundToHundred(s.round_to_hundred);
                setPriceEditableAtCounter(s.price_editable_at_counter);
                if (s.price_tiers && s.price_tiers.length > 0) {
                    setTiers(
                        s.price_tiers.map((tier: ServicePriceTier) => ({
                            weight_min: String(tier.weight_min),
                            weight_max: tier.weight_max !== null ? String(tier.weight_max) : '',
                            price_per_kg: String(tier.price_per_kg),
                        })),
                    );
                }
                setOverride(s.agency_pivot?.price_override?.toString() ?? '');
                setAgencyActive(s.agency_pivot?.is_active ?? true);
            })
            .catch((err) => {
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    function updateTier(index: number, patch: Partial<TierDraft>) {
        setTiers((current) => current.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    }

    function addTier() {
        setTiers((current) => [...current, emptyTier()]);
    }

    function removeTier(index: number) {
        setTiers((current) => current.filter((_, i) => i !== index));
    }

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        try {
            const needsTiers = billingMode === 'kg' || billingMode === 'mixte';
            const payload = {
                code: isEdit ? undefined : code,
                name,
                category,
                billing_mode: billingMode,
                description: description || null,
                base_price: billingMode === 'kg' ? null : Number(basePrice),
                estimated_duration_hours: Number(durationHours),
                is_active: isEdit ? isActive : undefined,
                allow_discount: allowDiscount,
                round_to_hundred: roundToHundred,
                price_editable_at_counter: priceEditableAtCounter,
                price_tiers: needsTiers
                    ? tiers
                          .filter((t) => t.weight_min !== '' && t.price_per_kg !== '')
                          .map((t) => ({
                              weight_min: Number(t.weight_min),
                              weight_max: t.weight_max === '' ? null : Number(t.weight_max),
                              price_per_kg: Number(t.price_per_kg),
                          }))
                    : undefined,
            };

            const saved = isEdit ? await api.patch<Service>(`/services/${id}`, payload) : await api.post<Service>('/services', payload);

            if (isEdit && agencyId) {
                await api.patch(`/agencies/${agencyId}/services/${saved.id}`, {
                    price_override: override === '' ? null : Number(override),
                    is_active: agencyActive,
                });
            }

            navigate('/services');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const needsTiers = billingMode === 'kg' || billingMode === 'mixte';
    const needsBasePrice = billingMode !== 'kg';
    const validTiers = tiers.filter((t) => t.weight_min !== '' && t.price_per_kg !== '');
    const canSubmit =
        name.trim() !== '' &&
        (isEdit || code.trim() !== '') &&
        (!needsBasePrice || basePrice !== '') &&
        (!needsTiers || validTiers.length > 0);
    const meta = categoryMeta(category);
    const Icon = meta.icon;

    if (loading) {
        return <LoadingState />;
    }

    if (notFound) {
        return (
            <div className="space-y-4">
                <BackLink />
                <Alert tone="error">{t('service.notFound')}</Alert>
            </div>
        );
    }

    return (
        <div className="max-w-3xl space-y-6">
            <BackLink />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset', TONES[meta.tone])}>
                        <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">
                            {isEdit ? t('service.edit') : t('service.new')}
                        </h1>
                        <p className="text-sm text-ink-600 dark:text-ink-350">
                            {isEdit ? t('service.editSubtitle') : t('service.newSubtitle')}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link to="/services" className={button('ghost', 'md')}>
                        {t('common.cancel')}
                    </Link>
                    <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : isEdit ? <Check aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                        {isEdit ? t('common.save') : t('common.create')}
                    </button>
                </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <section aria-labelledby="service-general-heading" className={cx(cardPadded, 'space-y-4')}>
                <h2 id="service-general-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <FileText aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                    {t('service.section.general')}
                </h2>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
                        <span className={label}>{t('service.code')}</span>
                        <input value={code} disabled={isEdit} onChange={(e) => setCode(e.target.value)} className={cx(input, 'w-full', isEdit && 'cursor-not-allowed opacity-60')} />
                    </label>
                </div>

                <label className="block">
                    <span className={label}>{t('common.notes')}</span>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                </label>

                {isEdit && (
                    <div className="flex items-center gap-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                        <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('service.table.status')} :</span>
                        {isActive ? <Pill tone="emerald">{t('service.active')}</Pill> : <Pill tone="rose">{t('service.inactive')}</Pill>}
                        <button type="button" onClick={() => setIsActive((v) => !v)} className={button('ghost', 'sm')}>
                            {isActive ? t('service.deactivate') : t('service.activate')}
                        </button>
                    </div>
                )}
            </section>

            <section aria-labelledby="service-pricing-heading" className={cx(cardPadded, 'space-y-4')}>
                <h2 id="service-pricing-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <Coins aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                    {t('service.section.pricing')}
                </h2>

                <div className="space-y-2">
                    <span className={label}>{t('service.billingMode')}</span>
                    <div className="grid grid-cols-3 gap-2">
                        {BILLING_MODES.map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setBillingMode(mode)}
                                className={cx(
                                    'rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                                    billingMode === mode
                                        ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-300'
                                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                )}
                            >
                                {t(`service.billingModeOption.${mode}`)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {needsBasePrice && (
                        <label className="block">
                            <span className={label}>{t('service.basePrice')}</span>
                            <input type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={cx(input, 'w-full')} />
                        </label>
                    )}
                    <label className="block">
                        <span className={label}>{t('service.duration')}</span>
                        <input type="number" min={1} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                </div>

                {needsTiers && (
                    <div className="space-y-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                        <div className="flex items-center justify-between">
                            <span className={cx(label, 'flex items-center gap-1.5')}>
                                <Scale aria-hidden="true" className="h-3.5 w-3.5" />
                                {t('service.priceTiers')}
                            </span>
                            <button type="button" onClick={addTier} className={button('ghost', 'sm')}>
                                <Plus aria-hidden="true" className="h-4 w-4" />
                                {t('service.addTier')}
                            </button>
                        </div>
                        {tiers.map((tier, index) => (
                            <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                                <label className="block">
                                    <span className="text-xs text-ink-500 dark:text-ink-400">{t('service.tierWeightMin')}</span>
                                    <input type="number" min={0} step={0.01} value={tier.weight_min} onChange={(e) => updateTier(index, { weight_min: e.target.value })} className={cx(inputSm, 'w-full')} />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-ink-500 dark:text-ink-400">{t('service.tierWeightMax')}</span>
                                    <input type="number" min={0} step={0.01} value={tier.weight_max} onChange={(e) => updateTier(index, { weight_max: e.target.value })} placeholder="∞" className={cx(inputSm, 'w-full')} />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-ink-500 dark:text-ink-400">{t('service.tierPricePerKg')}</span>
                                    <input type="number" min={0} value={tier.price_per_kg} onChange={(e) => updateTier(index, { price_per_kg: e.target.value })} className={cx(inputSm, 'w-full')} />
                                </label>
                                <button type="button" onClick={() => removeTier(index)} className={button('dangerGhost', 'sm', 'px-2')} aria-label={t('common.delete')}>
                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="space-y-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                    <label className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                        <input type="checkbox" checked={allowDiscount} onChange={(e) => setAllowDiscount(e.target.checked)} className="h-4 w-4 rounded" />
                        {t('service.allowDiscount')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                        <input type="checkbox" checked={roundToHundred} onChange={(e) => setRoundToHundred(e.target.checked)} className="h-4 w-4 rounded" />
                        {t('service.roundToHundred')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                        <input type="checkbox" checked={priceEditableAtCounter} onChange={(e) => setPriceEditableAtCounter(e.target.checked)} className="h-4 w-4 rounded" />
                        {t('service.priceEditableAtCounter')}
                    </label>
                </div>
            </section>

            {isEdit && agencyId && (
                <section aria-labelledby="service-availability-heading" className={cx(cardPadded, 'space-y-4')}>
                    <h2 id="service-availability-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                        <MapPin aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                        {t('service.section.availability')}
                    </h2>
                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('service.availabilityHint')}</p>

                    <div className="flex flex-wrap items-end gap-3">
                        <label className="block">
                            <span className={label}>{t('service.priceOverride')}</span>
                            <input
                                type="number"
                                min={0}
                                value={override}
                                onChange={(e) => setOverride(e.target.value)}
                                placeholder={service?.base_price !== null && service?.base_price !== undefined ? String(service.base_price) : String(basePrice)}
                                className={cx(inputSm, 'w-36')}
                            />
                        </label>
                        {agencyActive ? <Pill tone="emerald">{t('service.active')}</Pill> : <Pill tone="amber">{t('service.inactiveForAgency')}</Pill>}
                        <button type="button" onClick={() => setAgencyActive((v) => !v)} className={button('ghost', 'sm')}>
                            {agencyActive ? t('service.deactivateForAgency') : t('service.activateForAgency')}
                        </button>
                    </div>
                </section>
            )}

            {isEdit && service?.price_histories && service.price_histories.length > 0 && (
                <section aria-labelledby="service-history-heading" className={cx(cardPadded, 'space-y-3')}>
                    <h2 id="service-history-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                        <History aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                        {t('service.priceHistory')}
                    </h2>
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                        {service.price_histories.map((entry) => (
                            <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                <div className="min-w-0">
                                    <p className="font-medium text-ink-800 dark:text-ink-100">
                                        {entry.field === 'base_price'
                                            ? t('service.historyBasePrice', {
                                                  old: entry.old_value ? money(Number(entry.old_value)) : '—',
                                                  new: entry.new_value ? money(Number(entry.new_value)) : '—',
                                              })
                                            : t('service.historyTiers')}
                                    </p>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">
                                        {dateTime(entry.changed_at)}
                                        {entry.actor && ` · ${entry.actor.name}`}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function BackLink() {
    const { t } = useI18n();
    return (
        <Link to="/services" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('service.backToCatalog')}
        </Link>
    );
}
