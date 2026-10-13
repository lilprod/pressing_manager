import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Eye, History, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { categoryLabel } from '../../lib/serviceCategory';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cardPadded, cx, input, label, select, sectionTitle, textLink } from '../../components/ui/styles';
import Toggle from '../../components/ui/Toggle';
import type { FinishOption, IntakeCondition, Service, ServiceAvailabilityRow, ServiceBillingMode, ServicePriceTier, ServicePriority, TreatmentType } from '../../types';

/*
 * Fiche article conforme à la maquette « Modifier l'article » (2026-10-13). Un
 * article = un vêtement / une pièce de linge du catalogue (ex. « Costume 2 pièces »),
 * rangé dans une famille libre (ex. « Cérémonie »), avec :
 *  - un prix par traitement (Classique/Express/Repassage…) : le traitement de
 *    référence (ratio 1) porte le prix de base, les autres un prix explicite ou, à
 *    défaut, le ratio du traitement — même règle que le comptoir (priceFor côté API) ;
 *  - un délai par traitement, des grilles au kilo par traitement ;
 *  - les états du linge acceptés, les rendus compatibles, les services associés
 *    (autres articles suggérés au comptoir) et l'éligibilité à la livraison ;
 *  - la disponibilité par agence (prix local éventuel) ;
 *  - un brouillon serveur sauvegardé automatiquement, publié explicitement.
 */

const BILLING_MODES: ServiceBillingMode[] = ['piece', 'kg', 'mixte'];
const PRIORITIES: ServicePriority[] = ['standard', 'haute'];
/** Écart au-delà duquel un prix de traitement est signalé (« Recommandation »). */
const PRICE_GAP_WARNING = 40;

type TierDraft = { weight_min: string; weight_max: string; price_per_kg: string; treatment_prices: Record<string, string> };
type RateDraft = { price: string; delay: string };

interface FormState {
    code: string;
    name: string;
    category: string;
    billingMode: ServiceBillingMode;
    description: string;
    basePrice: string;
    durationHours: string;
    priority: ServicePriority;
    isActive: boolean;
    allowDiscount: boolean;
    roundToHundred: boolean;
    priceEditableAtCounter: boolean;
    homeDelivery: boolean;
    tiers: TierDraft[];
    rates: Record<string, RateDraft>;
    acceptedIds: number[];
    finishIds: number[];
    associatedIds: number[];
    availability: ServiceAvailabilityRow[];
}

const emptyTier = (): TierDraft => ({ weight_min: '', weight_max: '', price_per_kg: '', treatment_prices: {} });

const EMPTY_FORM: FormState = {
    code: '',
    name: '',
    category: '',
    billingMode: 'piece',
    description: '',
    basePrice: '',
    durationHours: '72',
    priority: 'standard',
    isActive: true,
    allowDiscount: true,
    roundToHundred: false,
    priceEditableAtCounter: false,
    homeDelivery: true,
    tiers: [emptyTier()],
    rates: {},
    acceptedIds: [],
    finishIds: [],
    associatedIds: [],
    availability: [],
};

function fromService(s: Service, availability: ServiceAvailabilityRow[]): FormState {
    const rates: Record<string, RateDraft> = {};
    (s.treatment_rates ?? []).forEach((r) => {
        rates[String(r.treatment_type_id)] = { price: r.price !== null ? String(r.price) : '', delay: r.delay_hours !== null ? String(r.delay_hours) : '' };
    });
    return {
        code: s.code,
        name: s.name,
        category: s.category,
        billingMode: s.billing_mode,
        description: s.description ?? '',
        basePrice: s.base_price !== null ? String(s.base_price) : '',
        durationHours: String(s.estimated_duration_hours),
        priority: s.priority,
        isActive: s.is_active,
        allowDiscount: s.allow_discount,
        roundToHundred: s.round_to_hundred,
        priceEditableAtCounter: s.price_editable_at_counter,
        homeDelivery: s.home_delivery_enabled ?? true,
        tiers:
            s.price_tiers && s.price_tiers.length > 0
                ? s.price_tiers.map((tier: ServicePriceTier) => ({
                      weight_min: String(tier.weight_min),
                      weight_max: tier.weight_max !== null ? String(tier.weight_max) : '',
                      price_per_kg: String(tier.price_per_kg),
                      treatment_prices: Object.fromEntries(Object.entries(tier.treatment_prices ?? {}).map(([k, v]) => [k, String(v)])),
                  }))
                : [emptyTier()],
        rates,
        acceptedIds: (s.accepted_conditions ?? []).map((c) => c.id),
        finishIds: (s.finish_options ?? []).map((f) => f.id),
        associatedIds: (s.associated_services ?? []).map((a) => a.id),
        availability,
    };
}

export default function ServiceFormPage() {
    const { id } = useParams<{ id: string }>();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, dateTime, time } = useFormat();
    const { user } = useAuth();

    const [service, setService] = useState<Service | null>(null);
    const [loading, setLoading] = useState(isEdit);
    const [notFound, setNotFound] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [publishedJson, setPublishedJson] = useState(JSON.stringify(EMPTY_FORM));
    const [savedJson, setSavedJson] = useState(JSON.stringify(EMPTY_FORM));
    const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
    const [draftSaver, setDraftSaver] = useState<string | null>(null);
    const [restoredDraft, setRestoredDraft] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [searchParams] = useSearchParams();
    const [showHistory, setShowHistory] = useState(searchParams.get('history') === '1');
    const [showClientPreview, setShowClientPreview] = useState(false);
    const [editingLocalPrice, setEditingLocalPrice] = useState<number | null>(null);

    const [conditions, setConditions] = useState<IntakeCondition[]>([]);
    const [treatments, setTreatments] = useState<TreatmentType[]>([]);
    const [finishOptions, setFinishOptions] = useState<FinishOption[]>([]);
    const [catalog, setCatalog] = useState<Service[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [deliveryZonesCount, setDeliveryZonesCount] = useState<number | null>(null);

    const update = useCallback((patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch })), []);

    useEffect(() => {
        api.get<IntakeCondition[]>('/intake-conditions').then(setConditions).catch(() => setConditions([]));
        api.get<TreatmentType[]>('/treatment-types').then((list) => setTreatments(list.filter((x) => x.is_active))).catch(() => setTreatments([]));
        api.get<FinishOption[]>('/finish-options').then((list) => setFinishOptions(list.filter((x) => x.is_active))).catch(() => setFinishOptions([]));
        api.get<string[]>('/services/categories').then(setCategories).catch(() => setCategories([]));
        api.get<{ data: Service[] }>('/services/catalog?per_page=200').then((r) => setCatalog(r.data)).catch(() => setCatalog([]));
        api.get<unknown[]>('/delivery-zones').then((zones) => setDeliveryZonesCount(zones.length)).catch(() => setDeliveryZonesCount(null));
    }, []);

    useEffect(() => {
        if (!id) return;
        Promise.all([api.get<Service>(`/services/${id}`), api.get<ServiceAvailabilityRow[]>(`/services/${id}/availability`).catch(() => [])])
            .then(([s, availability]) => {
                setService(s);
                const published = fromService(s, availability);
                setPublishedJson(JSON.stringify(published));
                const draft = s.draft_data as Partial<FormState> | null | undefined;
                const initial = draft ? { ...published, ...draft, code: published.code } : published;
                setForm(initial);
                setSavedJson(JSON.stringify(initial));
                setRestoredDraft(Boolean(draft));
                setDraftSavedAt(s.draft_saved_at ?? null);
                setDraftSaver(s.draft_saver?.name ?? null);
            })
            .catch((err) => {
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const formJson = JSON.stringify(form);
    const isDirty = formJson !== publishedJson;
    const hasUnsavedToServer = formJson !== savedJson;

    const saveDraft = useCallback(async () => {
        if (!id) return;
        setSavingDraft(true);
        try {
            const res = await api.put<{ draft_saved_at: string; draft_saver: { name: string } }>(`/services/${id}/draft`, { data: form });
            setSavedJson(JSON.stringify(form));
            setDraftSavedAt(res.draft_saved_at);
            setDraftSaver(res.draft_saver.name);
        } catch {
            // L'échec d'une sauvegarde automatique reste visible via « Modifications non enregistrées ».
        } finally {
            setSavingDraft(false);
        }
    }, [id, form]);

    // Sauvegarde automatique du brouillon (édition seulement), 1,5 s après la dernière frappe.
    const autosaveTimer = useRef<number | null>(null);
    useEffect(() => {
        if (!isEdit || loading || !hasUnsavedToServer || !isDirty) return;
        autosaveTimer.current = window.setTimeout(() => void saveDraft(), 1500);
        return () => {
            if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
        };
    }, [isEdit, loading, hasUnsavedToServer, isDirty, saveDraft]);

    useEffect(() => {
        if (!hasUnsavedToServer) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsavedToServer]);

    // Traitement de référence (ratio 1) : son prix est le prix de base de l'article.
    const refTreatment = useMemo(() => treatments.find((tr) => Number(tr.price_ratio) === 1) ?? null, [treatments]);
    const otherTreatments = treatments.filter((tr) => tr.id !== refTreatment?.id);

    const needsTiers = form.billingMode === 'kg' || form.billingMode === 'mixte';
    const needsBasePrice = form.billingMode !== 'kg';
    const base = Number(form.basePrice || 0);
    const round = (n: number) => (form.roundToHundred ? Math.round(n / 100) * 100 : n);
    const autoPrice = (tr: TreatmentType) => round(Math.round(base * Number(tr.price_ratio)));
    const priceFor = (tr: TreatmentType) => {
        if (tr.id === refTreatment?.id) return base;
        const explicit = form.rates[String(tr.id)]?.price;
        return explicit ? Number(explicit) : autoPrice(tr);
    };
    const delayFor = (tr: TreatmentType) => {
        if (tr.id === refTreatment?.id) return form.durationHours;
        return form.rates[String(tr.id)]?.delay || form.durationHours;
    };
    const setRate = (trId: number, patch: Partial<RateDraft>) =>
        setForm((f) => ({ ...f, rates: { ...f.rates, [String(trId)]: { ...{ price: '', delay: '' }, ...f.rates[String(trId)], ...patch } } }));

    const validTiers = form.tiers.filter((tier) => tier.weight_min !== '' && tier.price_per_kg !== '');
    const activeAgencies = form.availability.filter((row) => row.is_active).length;
    const impactedAgencies = isEdit ? activeAgencies : form.availability.length;
    const canSubmit =
        form.name.trim() !== '' && form.category.trim() !== '' && form.code.trim() !== '' && (!needsBasePrice || form.basePrice !== '') && (!needsTiers || validTiers.length > 0);

    const checks = [
        { key: 'info', done: form.name.trim() !== '' && form.code.trim() !== '' && form.category.trim() !== '' },
        { key: 'prices', done: (!needsBasePrice || base > 0) && (!needsTiers || validTiers.length > 0) },
        { key: 'delay', done: Number(form.durationHours) > 0 },
        { key: 'agency', done: !isEdit || form.availability.length === 0 || activeAgencies > 0 },
    ];
    const passed = checks.filter((c) => c.done).length;
    const priceGaps = needsBasePrice && base > 0
        ? otherTreatments
              .map((tr) => ({ name: tr.name, pct: Math.round(((priceFor(tr) - base) / base) * 100) }))
              .filter((g) => g.pct > PRICE_GAP_WARNING)
        : [];

    function buildPayload(publish: boolean) {
        return {
            code: isEdit ? undefined : form.code,
            name: form.name,
            category: form.category.trim(),
            billing_mode: form.billingMode,
            description: form.description || null,
            base_price: form.billingMode === 'kg' ? null : Number(form.basePrice),
            estimated_duration_hours: Number(form.durationHours),
            priority: form.priority,
            is_active: publish ? form.isActive : false,
            allow_discount: form.allowDiscount,
            round_to_hundred: form.roundToHundred,
            price_editable_at_counter: form.priceEditableAtCounter,
            home_delivery_enabled: form.homeDelivery,
            accepted_condition_ids: form.acceptedIds,
            finish_option_ids: form.finishIds,
            associated_service_ids: form.associatedIds,
            treatment_rates: otherTreatments.map((tr) => ({
                treatment_type_id: tr.id,
                price: form.billingMode !== 'kg' && form.rates[String(tr.id)]?.price ? Number(form.rates[String(tr.id)].price) : null,
                delay_hours: form.rates[String(tr.id)]?.delay ? Number(form.rates[String(tr.id)].delay) : null,
            })),
            price_tiers: needsTiers
                ? validTiers.map((tier) => ({
                      weight_min: Number(tier.weight_min),
                      weight_max: tier.weight_max === '' ? null : Number(tier.weight_max),
                      price_per_kg: Number(tier.price_per_kg),
                      treatment_prices: Object.fromEntries(Object.entries(tier.treatment_prices).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
                  }))
                : undefined,
        };
    }

    /** Publier (ou, à la création, « Enregistrer brouillon » = article créé désactivé). */
    async function submit(publish: boolean) {
        setBusy(true);
        setError(null);
        try {
            const payload = buildPayload(publish);
            const saved = isEdit ? await api.patch<Service>(`/services/${id}`, payload) : await api.post<Service>('/services', payload);
            if (isEdit && form.availability.length > 0) {
                await api.put(`/services/${saved.id}/availability`, {
                    agencies: form.availability.map((row) => ({ agency_id: row.agency_id, is_active: row.is_active, price_override: row.price_override })),
                });
            }
            setSavedJson(formJson);
            setPublishedJson(formJson);
            navigate(isEdit || publish ? '/services' : `/services/${saved.id}/edit`);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function discardChanges() {
        if (id) await api.delete(`/services/${id}/draft`).catch(() => undefined);
        const published = JSON.parse(publishedJson) as FormState;
        setForm(published);
        setSavedJson(publishedJson);
        setDraftSavedAt(null);
        setRestoredDraft(false);
    }

    const lastChange = service?.price_histories?.[0] ?? null;
    const associatedOptions = catalog.filter((s) => s.id !== service?.id && !form.associatedIds.includes(s.id));
    const associatedSelected = form.associatedIds.map((aid) => catalog.find((s) => s.id === aid) ?? service?.associated_services?.find((a) => a.id === aid)).filter(Boolean) as { id: number; name?: string }[];
    const associatedCount = form.associatedIds.length + (form.homeDelivery ? 1 : 0);

    if (loading) return <LoadingState />;

    if (notFound) {
        return (
            <div className="space-y-4">
                <BackLink />
                <Alert tone="error">{t('service.notFound')}</Alert>
            </div>
        );
    }

    const previewTreatments: { id: number; name: string; price: number; premium: boolean }[] = treatments.length > 0
        ? treatments.map((tr) => ({ id: tr.id, name: tr.name, price: priceFor(tr), premium: Number(tr.price_ratio) > 1 }))
        : [{ id: 0, name: t('service.basePrice'), price: base, premium: false }];

    return (
        <div className="space-y-6">
            <BackLink />

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{isEdit ? t('service.edit') : t('service.new')}</h1>
                    <p className="text-sm text-ink-600 dark:text-ink-350">{isEdit ? t('service.editSubtitle') : t('service.newSubtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/services" className={button('secondary', 'md')}>
                        {t('common.cancel')}
                    </Link>
                    <button
                        type="button"
                        onClick={() => (isEdit ? void saveDraft() : void submit(false))}
                        disabled={busy || savingDraft || (isEdit ? !hasUnsavedToServer : !canSubmit)}
                        className={button('secondary', 'md')}
                    >
                        {savingDraft ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {t('service.saveDraft')}
                    </button>
                    <button type="button" onClick={() => void submit(true)} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        {t('service.publish')}
                    </button>
                </div>
            </div>

            {isDirty && (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                    <span>
                        <span className="block font-semibold text-amber-900 dark:text-amber-200">{t('service.unsavedTitle')}</span>
                        <span className="text-amber-800 dark:text-amber-200/90">{t('service.unsavedHint', { count: impactedAgencies })}</span>
                    </span>
                </div>
            )}
            {restoredDraft && draftSavedAt && <Alert tone="info">{t('service.draft.restored', { date: dateTime(draftSavedAt), name: draftSaver ?? '—' })}</Alert>}
            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-6">
                    {/* Informations générales */}
                    <section aria-labelledby="article-general" className={cx(cardPadded, 'space-y-4')}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 id="article-general" className={sectionTitle}>
                                    {t('service.section.general')}
                                </h2>
                                <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.generalHint')}</p>
                            </div>
                            <Pill tone="accent">{t('service.required')}</Pill>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                            <label className="block">
                                <span className={label}>{t('service.name')}</span>
                                <input value={form.name} onChange={(e) => update({ name: e.target.value })} className={cx(input, 'w-full')} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('service.categoryLabel')}</span>
                                <input
                                    list="article-categories"
                                    value={form.category}
                                    placeholder={t('service.categoryPlaceholder')}
                                    onChange={(e) => update({ category: e.target.value })}
                                    className={cx(input, 'w-full')}
                                />
                                <datalist id="article-categories">
                                    {categories.map((c) => (
                                        <option key={c} value={c}>
                                            {categoryLabel(c, t)}
                                        </option>
                                    ))}
                                </datalist>
                            </label>
                            <label className="block">
                                <span className={label}>{t('service.code')}</span>
                                <input
                                    value={form.code}
                                    disabled={isEdit}
                                    onChange={(e) => update({ code: e.target.value })}
                                    className={cx(input, 'w-full', isEdit && 'cursor-not-allowed opacity-60')}
                                />
                            </label>
                        </div>
                        <Toggle checked={form.isActive} onChange={(v) => update({ isActive: v })} label={t('service.articleActive')} description={t('service.articleActiveHint')} />
                        <div className="space-y-2">
                            <span className={label}>{t('service.billingMode')}</span>
                            <div className="grid grid-cols-3 gap-2">
                                {BILLING_MODES.map((mode) => {
                                    const selected = form.billingMode === mode;
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => update({ billingMode: mode })}
                                            className={cx(
                                                'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                                                selected
                                                    ? 'border-brand-400 bg-brand-50 text-brand-800 dark:border-brand-400/50 dark:bg-brand-400/10 dark:text-brand-200'
                                                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300',
                                            )}
                                        >
                                            {t(`service.billingModeOption.${mode}`)}
                                            {selected && <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* Tarification à la pièce */}
                    {needsBasePrice && (
                        <section aria-labelledby="article-piece" className={cx(cardPadded, 'space-y-4')}>
                            <div>
                                <h2 id="article-piece" className={sectionTitle}>
                                    {t('service.piecePricing')}
                                </h2>
                                <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.piecePricingHint')}</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {!refTreatment && (
                                    <PriceField
                                        label={t('service.basePriceLabel', { hours: form.durationHours || '—' })}
                                        value={form.basePrice}
                                        onChange={(v) => update({ basePrice: v })}
                                    />
                                )}
                                {treatments.map((tr) =>
                                    tr.id === refTreatment?.id ? (
                                        <PriceField
                                            key={tr.id}
                                            label={t('service.treatmentLabel', { name: tr.name, hours: delayFor(tr) || '—' })}
                                            value={form.basePrice}
                                            onChange={(v) => update({ basePrice: v })}
                                        />
                                    ) : (
                                        <PriceField
                                            key={tr.id}
                                            premium={Number(tr.price_ratio) > 1}
                                            label={t('service.treatmentLabel', { name: tr.name, hours: delayFor(tr) || '—' })}
                                            value={form.rates[String(tr.id)]?.price ?? ''}
                                            placeholder={base > 0 ? String(autoPrice(tr)) : ''}
                                            onChange={(v) => setRate(tr.id, { price: v })}
                                        />
                                    ),
                                )}
                            </div>
                            {treatments.length === 0 && <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.noTreatments')}</p>}
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <Check2 checked={form.allowDiscount} onChange={(v) => update({ allowDiscount: v })} label={t('service.allowDiscountShort')} />
                                <Check2 checked={form.roundToHundred} onChange={(v) => update({ roundToHundred: v })} label={t('service.roundShort')} />
                                <Check2 checked={form.priceEditableAtCounter} onChange={(v) => update({ priceEditableAtCounter: v })} label={t('service.priceEditableShort')} />
                            </div>
                        </section>
                    )}

                    {/* Grilles au kilo */}
                    {needsTiers && (
                        <section aria-labelledby="article-kg" className={cx(cardPadded, 'space-y-3')}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 id="article-kg" className={sectionTitle}>
                                        {t('service.kgGrid')}
                                    </h2>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.kgGridHint', { mode: t(`service.billingModeOption.${form.billingMode}`) })}</p>
                                </div>
                                <button type="button" onClick={() => update({ tiers: [...form.tiers, emptyTier()] })} className={button('secondary', 'sm')}>
                                    <Plus aria-hidden="true" className="h-4 w-4" />
                                    {t('service.addRow')}
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <div className="min-w-[640px] space-y-2">
                                    <div
                                        role="row"
                                        className="grid gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                                        style={{ gridTemplateColumns: `minmax(200px,1.3fr) repeat(${1 + otherTreatments.length}, minmax(110px,1fr)) 36px` }}
                                    >
                                        <span>{t('service.tierRange')}</span>
                                        <span>{refTreatment ? t('service.perKg', { name: refTreatment.name }) : t('service.baseKg')}</span>
                                        {otherTreatments.map((tr) => (
                                            <span key={tr.id}>{t('service.perKg', { name: tr.name })}</span>
                                        ))}
                                        <span />
                                    </div>
                                    {form.tiers.map((tier, index) => {
                                        const setTier = (patch: Partial<TierDraft>) => update({ tiers: form.tiers.map((x, i) => (i === index ? { ...x, ...patch } : x)) });
                                        return (
                                            <div
                                                key={index}
                                                className="grid items-center gap-2"
                                                style={{ gridTemplateColumns: `minmax(200px,1.3fr) repeat(${1 + otherTreatments.length}, minmax(110px,1fr)) 36px` }}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <input aria-label={t('service.tierWeightMin')} type="number" min={0} step={0.1} value={tier.weight_min} onChange={(e) => setTier({ weight_min: e.target.value })} className={cx(input, 'w-full px-2')} />
                                                    <span className="text-ink-400">–</span>
                                                    <input aria-label={t('service.tierWeightMax')} type="number" min={0} step={0.1} placeholder="+" value={tier.weight_max} onChange={(e) => setTier({ weight_max: e.target.value })} className={cx(input, 'w-full px-2')} />
                                                    <span className="text-xs text-ink-500">kg</span>
                                                </div>
                                                <input aria-label={refTreatment ? t('service.perKg', { name: refTreatment.name }) : t('service.baseKg')} type="number" min={0} value={tier.price_per_kg} onChange={(e) => setTier({ price_per_kg: e.target.value })} className={cx(input, 'w-full')} />
                                                {otherTreatments.map((tr) => (
                                                    <input
                                                        key={tr.id}
                                                        aria-label={t('service.perKg', { name: tr.name })}
                                                        type="number"
                                                        min={0}
                                                        placeholder={tier.price_per_kg ? String(Math.round(Number(tier.price_per_kg) * Number(tr.price_ratio))) : ''}
                                                        value={tier.treatment_prices[String(tr.id)] ?? ''}
                                                        onChange={(e) => setTier({ treatment_prices: { ...tier.treatment_prices, [String(tr.id)]: e.target.value } })}
                                                        className={cx(input, 'w-full')}
                                                    />
                                                ))}
                                                <button type="button" onClick={() => update({ tiers: form.tiers.filter((_, i) => i !== index) })} className={button('dangerGhost', 'sm', 'px-2')} aria-label={t('common.delete')}>
                                                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {form.billingMode === 'kg' && (
                                <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                                    <Check2 checked={form.allowDiscount} onChange={(v) => update({ allowDiscount: v })} label={t('service.allowDiscountShort')} />
                                    <Check2 checked={form.roundToHundred} onChange={(v) => update({ roundToHundred: v })} label={t('service.roundShort')} />
                                </div>
                            )}
                        </section>
                    )}

                    {/* Traitement et compatibilités */}
                    <section aria-labelledby="article-treatment" className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 id="article-treatment" className={sectionTitle}>
                                {t('service.treatmentSection')}
                            </h2>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.treatmentSectionHint')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <HoursField
                                label={refTreatment ? t('service.delayFor', { name: refTreatment.name.toLowerCase() }) : t('service.delayBase')}
                                value={form.durationHours}
                                onChange={(v) => update({ durationHours: v })}
                                suffix={t('service.hoursSuffix')}
                            />
                            {otherTreatments.map((tr) => (
                                <HoursField
                                    key={tr.id}
                                    label={t('service.delayFor', { name: tr.name.toLowerCase() })}
                                    value={form.rates[String(tr.id)]?.delay ?? ''}
                                    placeholder={form.durationHours}
                                    onChange={(v) => setRate(tr.id, { delay: v })}
                                    suffix={t('service.hoursSuffix')}
                                />
                            ))}
                            <label className="block">
                                <span className={label}>{t('service.priority')}</span>
                                <select value={form.priority} onChange={(e) => update({ priority: e.target.value as ServicePriority })} className={cx(select, 'w-full')}>
                                    {PRIORITIES.map((p) => (
                                        <option key={p} value={p}>
                                            {t(`service.priorityOption.${p}`)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                            <fieldset className="space-y-2">
                                <legend className="mb-1 text-xs font-semibold text-ink-800 dark:text-ink-100">{t('service.acceptedConditions')}</legend>
                                {conditions.map((condition) => (
                                    <Check2
                                        key={condition.id}
                                        checked={form.acceptedIds.includes(condition.id)}
                                        onChange={(v) => update({ acceptedIds: v ? [...form.acceptedIds, condition.id] : form.acceptedIds.filter((x) => x !== condition.id) })}
                                        label={condition.label}
                                    />
                                ))}
                                <p className="text-[11px] text-ink-500 dark:text-ink-400">{t('service.acceptedConditionsHint')}</p>
                            </fieldset>
                            <fieldset className="space-y-2">
                                <legend className="mb-1 text-xs font-semibold text-ink-800 dark:text-ink-100">{t('service.finishes')}</legend>
                                {finishOptions.length === 0 && <p className="text-xs text-ink-500">{t('service.finishesEmpty')}</p>}
                                {finishOptions.map((option) => (
                                    <Check2
                                        key={option.id}
                                        checked={form.finishIds.includes(option.id)}
                                        onChange={(v) => update({ finishIds: v ? [...form.finishIds, option.id] : form.finishIds.filter((x) => x !== option.id) })}
                                        label={option.name}
                                    />
                                ))}
                                <Link to="/services/treatment-types" className={cx(textLink, 'text-[11px]')}>
                                    {t('service.finishesManage')}
                                </Link>
                            </fieldset>
                            <fieldset className="space-y-2">
                                <legend className="mb-1 text-xs font-semibold text-ink-800 dark:text-ink-100">{t('service.associated')}</legend>
                                <Check2 checked={form.homeDelivery} onChange={(v) => update({ homeDelivery: v })} label={t('service.homeDelivery')} />
                                {associatedSelected.map((a) => (
                                    <Check2 key={a.id} checked onChange={() => update({ associatedIds: form.associatedIds.filter((x) => x !== a.id) })} label={a.name ?? `#${a.id}`} />
                                ))}
                                <select
                                    aria-label={t('service.associatedPick')}
                                    value=""
                                    onChange={(e) => e.target.value && update({ associatedIds: [...form.associatedIds, Number(e.target.value)] })}
                                    className={cx(select, 'w-full text-xs')}
                                >
                                    <option value="">{t('service.associatedPick')}</option>
                                    {associatedOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </fieldset>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800/60">
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink-900 dark:text-white">{form.homeDelivery ? t('service.deliveryBanner') : t('service.deliveryOff')}</span>
                                <span className="text-xs text-ink-600 dark:text-ink-350">
                                    {form.homeDelivery ? t('service.deliveryBannerHint', { count: deliveryZonesCount ?? 0 }) : t('service.deliveryOffHint')}
                                </span>
                            </span>
                            <Pill tone={associatedCount > 0 ? 'emerald' : 'neutral'}>{t('service.servicesCount', { count: associatedCount })}</Pill>
                        </div>
                    </section>

                    {/* Disponibilité par agence */}
                    {isEdit && form.availability.length > 0 && (
                        <section aria-labelledby="article-availability" className={cx(cardPadded, 'space-y-2')}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <h2 id="article-availability" className={sectionTitle}>
                                        {t('service.section.availability')}
                                    </h2>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.availabilitySubtitle', { active: activeAgencies, total: form.availability.length })}</p>
                                </div>
                                <button type="button" onClick={() => update({ availability: form.availability.map((r) => ({ ...r, is_active: true })) })} className={button('secondary', 'sm')}>
                                    {t('service.activateAll')}
                                </button>
                            </div>
                            <ul className="max-h-[480px] divide-y divide-ink-100 overflow-auto dark:divide-ink-800">
                                {form.availability.map((row) => {
                                    const setRow = (patch: Partial<ServiceAvailabilityRow>) => update({ availability: form.availability.map((r) => (r.agency_id === row.agency_id ? { ...r, ...patch } : r)) });
                                    const delta = row.price_override !== null && base > 0 ? Math.round(((row.price_override - base) / base) * 100) : null;
                                    return (
                                        <li key={row.agency_id} className="flex flex-wrap items-center gap-3 py-3">
                                            <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                                                <span className="block truncate text-sm font-semibold text-ink-900 dark:text-white">{row.agency_name}</span>
                                                {editingLocalPrice === row.agency_id ? (
                                                    <span className="mt-1 flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            autoFocus
                                                            aria-label={`${t('service.priceOverride')} — ${row.agency_name}`}
                                                            placeholder={form.basePrice || '—'}
                                                            value={row.price_override ?? ''}
                                                            onChange={(e) => setRow({ price_override: e.target.value === '' ? null : Number(e.target.value) })}
                                                            className={cx(input, 'w-32 py-1')}
                                                        />
                                                        <button type="button" onClick={() => setEditingLocalPrice(null)} className={button('ghost', 'sm', 'px-2')} aria-label={t('common.close')}>
                                                            <X aria-hidden="true" className="h-4 w-4" />
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <button type="button" onClick={() => setEditingLocalPrice(row.agency_id)} className="group flex items-center gap-1 text-left text-xs text-ink-500 dark:text-ink-400">
                                                        {delta !== null && delta !== 0
                                                            ? t('service.localPrice', { delta: `${delta > 0 ? '+' : ''}${delta} %` })
                                                            : t('service.networkPrice')}
                                                        {row.city ? ` · ${row.city}` : ''}
                                                        <Pencil aria-label={t('service.editLocalPrice')} className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                                    </button>
                                                )}
                                            </span>
                                            <Pill tone={row.is_active ? 'emerald' : 'neutral'}>{row.is_active ? t('service.available') : t('service.unavailable')}</Pill>
                                            <Toggle className="shrink-0" checked={row.is_active} onChange={(v) => setRow({ is_active: v })} label={<span className="sr-only">{row.agency_name}</span>} />
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {showHistory && service?.price_histories && (
                        <section id="article-history" aria-labelledby="article-history-title" className={cx(cardPadded, 'space-y-3')}>
                            <h2 id="article-history-title" className={cx(sectionTitle, 'flex items-center gap-2')}>
                                <History aria-hidden="true" className="h-4 w-4 text-ink-500" />
                                {t('service.priceHistory')}
                            </h2>
                            {service.price_histories.length === 0 && <p className="text-sm text-ink-500">{t('service.priceHistory.empty')}</p>}
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {service.price_histories.map((entry) => (
                                    <li key={entry.id} className="py-2.5 text-sm">
                                        <p className="font-medium text-ink-800 dark:text-ink-100">
                                            {entry.field === 'base_price'
                                                ? t('service.historyBasePrice', {
                                                      old: entry.old_value ? money(Number(entry.old_value)) : '—',
                                                      new: entry.new_value ? money(Number(entry.new_value)) : '—',
                                                  })
                                                : entry.field === 'treatment_rates'
                                                  ? t('service.historyTreatmentRates')
                                                  : t('service.historyTiers')}
                                        </p>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">
                                            {dateTime(entry.changed_at)}
                                            {entry.actor && ` · ${entry.actor.name}`}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>

                <aside className="space-y-4 lg:sticky lg:top-24">
                    {/* Aperçu */}
                    <section className="space-y-3 rounded-2xl bg-brand-950 p-5 text-white">
                        <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full bg-accent-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-200">
                                {(form.category ? categoryLabel(form.category, t) : '—') + ' • ' + t(`service.billingModeOption.${form.billingMode}`)}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-100/70">{t('service.preview')}</span>
                        </div>
                        <p className="font-display text-xl font-bold">{form.name || t('service.new')}</p>
                        <p className="text-xs text-brand-100/80">
                            {form.code || '—'} • {t('service.previewDelay', { hours: form.durationHours || '—' })} • {form.isActive ? t('service.active') : t('service.inactive')}
                        </p>
                        {needsBasePrice && base > 0 ? (
                            <dl className="space-y-1.5 text-sm">
                                {previewTreatments.map((tr) => (
                                    <div key={tr.id} className="flex justify-between gap-3">
                                        <dt className="text-brand-100/90">{tr.name}</dt>
                                        <dd className={cx('font-semibold tabular-nums', tr.premium && 'text-accent-300')}>{money(tr.price)}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className="text-sm text-brand-100/90">{t('service.previewKg')}</p>
                        )}
                        <p className="text-[11px] text-brand-100/70">{t('service.previewFootnote')}</p>
                    </section>

                    {/* Contrôle avant publication */}
                    <section className={cx(cardPadded, 'space-y-2')}>
                        <div>
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('service.checklist.title')}</h2>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.checklist.passed', { count: passed })}</p>
                        </div>
                        <ul className="space-y-1.5 text-sm">
                            {checks.map((c) => (
                                <li key={c.key} className={cx('flex items-center gap-2', c.done ? 'text-ink-800 dark:text-ink-100' : 'text-ink-500 dark:text-ink-400')}>
                                    <CheckCircle2 aria-hidden="true" className={cx('h-4 w-4', c.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-300 dark:text-ink-600')} />
                                    {t(`service.checklist.${c.key}`)}
                                </li>
                            ))}
                        </ul>
                        {priceGaps.map((gap) => (
                            <div key={gap.name} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-400/30 dark:bg-amber-400/10">
                                <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('service.recommendation')}
                                </p>
                                <p className="text-amber-800 dark:text-amber-200/90">{t('service.recommendationGap', { name: gap.name, pct: gap.pct })}</p>
                            </div>
                        ))}
                    </section>

                    {/* État du brouillon */}
                    <section className={cx(cardPadded, 'space-y-2')}>
                        <div>
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('service.draft.title')}</h2>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{isEdit ? t('service.draft.autosave') : t('service.draft.createHint')}</p>
                        </div>
                        {isEdit && (
                            <>
                                <div className="flex items-center justify-between gap-2">
                                    {draftSavedAt ? <Pill tone="amber">{t('service.draft.badge')}</Pill> : <span className="text-xs text-ink-500">{t('service.draft.none')}</span>}
                                    {draftSavedAt && <span className="text-xs tabular-nums text-ink-500">{time(draftSavedAt)}</span>}
                                </div>
                                <button type="button" onClick={() => void saveDraft()} disabled={savingDraft || !hasUnsavedToServer} className={button('secondary', 'sm')}>
                                    {savingDraft ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                                    {t('service.draft.saveNow')}
                                </button>
                            </>
                        )}
                    </section>

                    {/* Dernière modification */}
                    {isEdit && (
                        <section className={cx(cardPadded, 'space-y-2')}>
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('service.lastChange')}</h2>
                            <p className="text-xs text-ink-600 dark:text-ink-350">
                                {lastChange
                                    ? `${lastChange.actor?.name ?? t('order.audit.systemActor')} • ${dateTime(lastChange.changed_at)}`
                                    : service?.updated_at
                                      ? dateTime(service.updated_at)
                                      : '—'}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowHistory((v) => !v);
                                    window.setTimeout(() => document.getElementById('article-history')?.scrollIntoView({ behavior: 'smooth' }), 50);
                                }}
                                className={button('secondary', 'sm')}
                            >
                                <History aria-hidden="true" className="h-4 w-4" />
                                {showHistory ? t('service.hideHistory') : t('service.viewHistory')}
                            </button>
                        </section>
                    )}

                    {/* Validation finale */}
                    <section className={cx(cardPadded, 'space-y-2')}>
                        <div>
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('service.finalValidation')}</h2>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.finalValidationHint', { count: impactedAgencies || (user?.agency_id ? 1 : 0) })}</p>
                        </div>
                        <button type="button" onClick={() => setShowClientPreview(true)} className={button('secondary', 'sm')}>
                            <Eye aria-hidden="true" className="h-4 w-4" />
                            {t('service.clientPreview')}
                        </button>
                        <button type="button" onClick={() => void submit(true)} disabled={!canSubmit || busy} className={button('primary', 'sm', 'w-full justify-center')}>
                            <Check aria-hidden="true" className="h-4 w-4" />
                            {t('service.publishArticle')}
                        </button>
                        {isEdit && (
                            <button type="button" onClick={() => void discardChanges()} disabled={!isDirty && !draftSavedAt} className={cx(textLink, 'block w-full text-center text-xs disabled:opacity-50')}>
                                {t('service.discardChanges')}
                            </button>
                        )}
                    </section>
                </aside>
            </div>

            {showClientPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="client-preview-title">
                    <div className={cx(cardPadded, 'w-full max-w-sm space-y-3')}>
                        <div className="flex items-center justify-between">
                            <h2 id="client-preview-title" className={sectionTitle}>
                                {t('service.clientPreview')}
                            </h2>
                            <button type="button" onClick={() => setShowClientPreview(false)} className={button('ghost', 'sm', 'px-2')} aria-label={t('common.close')}>
                                <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('service.clientPreviewHint')}</p>
                        <ul className="divide-y divide-dashed divide-ink-200 rounded-lg border border-dashed border-ink-300 bg-white p-3 font-mono text-xs text-ink-900 dark:border-ink-600 dark:bg-ink-900 dark:text-ink-100">
                            {(needsBasePrice ? previewTreatments : []).map((tr) => (
                                <li key={tr.id} className="flex justify-between gap-2 py-1.5">
                                    <span>
                                        {form.name || '—'} ({tr.name}) × 1
                                    </span>
                                    <span>{money(tr.price)}</span>
                                </li>
                            ))}
                            {!needsBasePrice && <li className="py-1.5">{t('service.previewKg')}</li>}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

function PriceField({ label: text, value, onChange, placeholder, premium = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; premium?: boolean }) {
    return (
        <label className="block">
            <span className={label}>{text}</span>
            <span className="relative block">
                <input
                    type="number"
                    min={0}
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                    className={cx(input, 'w-full pr-14 font-semibold', premium && '!border-accent-300 !bg-accent-50 dark:!border-accent-400/40 dark:!bg-accent-400/10')}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-ink-400">FCFA</span>
            </span>
        </label>
    );
}

function HoursField({ label: text, value, onChange, placeholder, suffix }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix: string }) {
    return (
        <label className="block">
            <span className={label}>{text}</span>
            <span className="relative block">
                <input type="number" min={1} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(input, 'w-full pr-16')} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-ink-400">{suffix}</span>
            </span>
        </label>
    );
}

function Check2({ checked, onChange, label: text }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded accent-brand-700" />
            {text}
        </label>
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
