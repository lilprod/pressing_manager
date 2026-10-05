import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useSettings } from '../../contexts/SettingsContext';
import { api, ApiError } from '../../lib/api';
import { queuePendingOrder } from '../../lib/offlineDb';
import { readCachedServices, writeCachedServices } from '../../lib/servicesCache';
import { readCachedIntakeConditions, writeCachedIntakeConditions } from '../../lib/intakeConditionsCache';
import { readCachedTreatmentTypes, writeCachedTreatmentTypes } from '../../lib/treatmentTypesCache';
import { readRecentClients, rememberClients } from '../../lib/recentClientsCache';
import { syncEvents } from '../../lib/sync';
import { categoryMeta } from '../../lib/serviceCategory';
import type { AgencySettings, Client, IntakeCondition, Order, Service, ServiceCategory, TreatmentType } from '../../types';
import {
    Award,
    Building2,
    Check,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Minus,
    Phone,
    Plus,
    Receipt,
    Search,
    SearchX,
    ShoppingBag,
    ShoppingBasket,
    Star,
    StickyNote,
    Tag,
    Trash2,
    X,
    Zap,
} from 'lucide-react';
import { useFormat } from '../../lib/format';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { Pill, TONES } from '../../components/ui/StatusBadge';
import { button, card, cardPadded, cx, inputLg, inputSm, label, sectionTitle } from '../../components/ui/styles';

const SERVICE_CATEGORY_ORDER: ServiceCategory[] = ['nettoyage', 'lavage', 'repassage', 'retouche', 'teinture', 'autre'];

interface CartLine {
    service_id: number;
    quantity: number;
    weight_kg: number | null;
    description: string;
    intake_condition_ids: number[];
    intake_notes: string;
    treatment_type_id: number | null;
}

/** Aperçu client du prix au kilo — le serveur recalcule et fait foi à la création du dépôt. */
function resolveTierPrice(service: Service | undefined, weightKg: number): number | null {
    const tier = service?.price_tiers?.find((t) => weightKg >= t.weight_min && (t.weight_max === null || weightKg <= t.weight_max));
    if (!tier) return null;
    const raw = tier.price_per_kg * weightKg;
    return service?.round_to_hundred ? Math.round(raw / 100) * 100 : Math.round(raw);
}

/** Aperçu client du ratio de traitement — le serveur recalcule et fait foi à la création du dépôt. */
function applyTreatmentRatio(amount: number, treatmentType: TreatmentType | undefined): number {
    if (!treatmentType) return amount;
    return Math.round(amount * treatmentType.price_ratio);
}

function lineTotal(service: Service | undefined, treatmentType: TreatmentType | undefined, line: CartLine): number {
    if (service?.billing_mode === 'kg' && line.weight_kg) {
        const tierPrice = resolveTierPrice(service, line.weight_kg) ?? 0;
        return applyTreatmentRatio(tierPrice, treatmentType);
    }
    const unitPrice = applyTreatmentRatio(service?.effective_price ?? 0, treatmentType);
    return unitPrice * line.quantity;
}

export default function NewOrder() {
    const { user, activeAgencyId } = useAuth();
    const { t } = useI18n();
    const { money } = useFormat();
    const { settings } = useSettings();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const taxRate = settings?.tax_rate ?? 0;

    const agencyId = user?.agency_id ?? activeAgencyId;

    const [services, setServices] = useState<(Service & { effective_price: number })[]>([]);
    const [agencySettings, setAgencySettings] = useState<AgencySettings | null>(null);
    const [intakeConditions, setIntakeConditions] = useState<IntakeCondition[]>(readCachedIntakeConditions());
    const [treatmentTypes, setTreatmentTypes] = useState<TreatmentType[]>(readCachedTreatmentTypes());
    const [expandedLine, setExpandedLine] = useState<number | null>(null);
    const [serviceQuery, setServiceQuery] = useState('');
    const [clientQuery, setClientQuery] = useState('');
    const [clientResults, setClientResults] = useState<Client[]>(readRecentClients());
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [isExpress, setIsExpress] = useState(false);
    const [notes, setNotes] = useState('');
    const [discount, setDiscount] = useState(0);
    const [discountEdited, setDiscountEdited] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!agencyId) {
            return;
        }
        setServices(readCachedServices(agencyId));
        api
            .get<(Service & { effective_price: number })[]>(`/services?agency_id=${agencyId}`)
            .then((list) => {
                setServices(list);
                writeCachedServices(agencyId, list);
            })
            .catch(() => {
                // Hors-ligne : on garde le catalogue mis en cache lors du dernier chargement réussi.
            });
    }, [agencyId]);

    // Réglages opérationnels par agence (« Paramètres opérationnels ») : seul le seuil
    // d'utilisation de la fidélité est consommé ici (gate la remise auto ci-dessous).
    useEffect(() => {
        if (!agencyId) return;
        api
            .get<AgencySettings>(`/agencies/${agencyId}/settings`)
            .then(setAgencySettings)
            .catch(() => setAgencySettings(null));
    }, [agencyId]);

    useEffect(() => {
        api
            .get<IntakeCondition[]>('/intake-conditions')
            .then((list) => {
                setIntakeConditions(list);
                writeCachedIntakeConditions(list);
            })
            .catch(() => {
                // Hors-ligne : on garde le catalogue mis en cache lors du dernier chargement réussi.
            });
    }, []);

    useEffect(() => {
        api
            .get<TreatmentType[]>('/treatment-types')
            .then((list) => {
                const active = list.filter((t) => t.is_active);
                setTreatmentTypes(active);
                writeCachedTreatmentTypes(active);
            })
            .catch(() => {
                // Hors-ligne : on garde le référentiel mis en cache lors du dernier chargement réussi.
            });
    }, []);

    useEffect(() => {
        if (clientQuery.trim().length < 2) {
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            api
                .get<{ data: Client[] }>(`/clients?search=${encodeURIComponent(clientQuery)}&agency_id=${agencyId}`, controller.signal)
                .then((res) => {
                    setClientResults(res.data);
                    rememberClients(res.data);
                })
                .catch(() => {
                    const term = clientQuery.toLowerCase();
                    setClientResults(
                        readRecentClients().filter(
                            (c) =>
                                c.agency_id === agencyId &&
                                (`${c.first_name} ${c.last_name}`.toLowerCase().includes(term) || c.phone.includes(term)),
                        ),
                    );
                });
        }, 300);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [clientQuery, agencyId]);

    // Préselection depuis la fiche client (« Enregistrer et créer un dépôt »).
    useEffect(() => {
        const clientId = searchParams.get('client');
        if (!clientId) return;
        api
            .get<Client>(`/clients/${clientId}`)
            .then((found) => {
                setSelectedClient(found);
                rememberClients([found]);
            })
            .catch(() => {
                // Client introuvable ou hors de portée : l'utilisateur garde la recherche manuelle.
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const total = useMemo(
        () =>
            cart.reduce((sum, line) => {
                const service = services.find((s) => s.id === line.service_id);
                const treatmentType = treatmentTypes.find((t) => t.id === line.treatment_type_id);
                return sum + lineTotal(service, treatmentType, line);
            }, 0),
        [cart, services, treatmentTypes],
    );

    // Pré-remplit la remise à partir du palier de fidélité du client tant que le personnel
    // n'a pas modifié la valeur manuellement ; reste éditable à tout moment.
    useEffect(() => {
        if (discountEdited) return;
        const rate = selectedClient?.loyalty_discount_rate ?? 0;
        // Seuil d'utilisation configurable par agence (« Paramètres opérationnels ») :
        // pas de remise auto tant que le client n'a pas atteint le seuil de points requis.
        const threshold = agencySettings?.loyalty_redemption_threshold ?? 0;
        const meetsThreshold = (selectedClient?.loyalty_points ?? 0) >= threshold;
        setDiscount(rate > 0 && meetsThreshold ? Math.round(total * rate) : 0);
    }, [selectedClient, total, discountEdited, agencySettings]);

    // Même formule que InvoiceService::createFromOrder côté back, pour que le total annoncé
    // au comptoir corresponde exactement à celui de la facture générée ensuite (TVA incluse).
    const taxableBase = Math.max(0, total - discount);
    const taxAmount = Math.round(taxableBase * taxRate);
    const grandTotal = taxableBase + taxAmount;

    function addLine(serviceId: number) {
        const service = services.find((s) => s.id === serviceId);
        const billedByWeight = service?.billing_mode === 'kg';
        setCart((current) => {
            const existing = current.find((l) => l.service_id === serviceId);
            if (existing) {
                // Un article facturé au kilo n'a qu'une seule ligne : on modifie le poids
                // directement plutôt que d'incrémenter une quantité qui n'a pas de sens ici.
                if (billedByWeight) return current;
                return current.map((l) => (l.service_id === serviceId ? { ...l, quantity: l.quantity + 1 } : l));
            }
            return [
                ...current,
                {
                    service_id: serviceId,
                    quantity: 1,
                    weight_kg: billedByWeight ? 0 : null,
                    description: '',
                    intake_condition_ids: [],
                    intake_notes: '',
                    treatment_type_id: null,
                },
            ];
        });
    }

    function setLineTreatmentType(serviceId: number, treatmentTypeId: number | null) {
        setCart((current) =>
            current.map((l) =>
                l.service_id === serviceId
                    ? { ...l, treatment_type_id: l.treatment_type_id === treatmentTypeId ? null : treatmentTypeId }
                    : l,
            ),
        );
    }

    function toggleWeightBilling(serviceId: number) {
        setCart((current) => current.map((l) => (l.service_id === serviceId ? { ...l, weight_kg: l.weight_kg === null ? 0 : null } : l)));
    }

    function updateLine(serviceId: number, patch: Partial<CartLine>) {
        setCart((current) => current.map((l) => (l.service_id === serviceId ? { ...l, ...patch } : l)));
    }

    function removeLine(serviceId: number) {
        setCart((current) => current.filter((l) => l.service_id !== serviceId));
    }

    async function handleSubmit() {
        if (!selectedClient || cart.length === 0 || !agencyId) {
            return;
        }

        setError(null);
        setFeedback(null);
        setSubmitting(true);

        const clientLocalUuid = crypto.randomUUID();
        const payload = {
            // L'API exige l'agence pour un rôle global et la refuse pour un rôle d'agence.
            ...(user?.agency_id === null ? { agency_id: agencyId } : {}),
            client_id: selectedClient.id,
            client_local_uuid: clientLocalUuid,
            is_express: isExpress,
            notes: notes || null,
            discount_amount: discount > 0 ? discount : undefined,
            items: cart.map((l) => ({
                service_id: l.service_id,
                quantity: l.quantity,
                weight_kg: l.weight_kg ?? undefined,
                description: l.description || null,
                intake_condition_ids: l.intake_condition_ids.length > 0 ? l.intake_condition_ids : undefined,
                intake_notes: l.intake_notes || null,
                treatment_type_id: l.treatment_type_id ?? undefined,
            })),
        };

        try {
            if (!navigator.onLine) {
                throw new TypeError('offline');
            }

            const order = await api.post<Order>('/orders', payload);
            setFeedback(t('order.submitted'));
            resetForm();
            navigate(`/orders/${order.id}`);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                await queuePendingOrder({
                    client_local_uuid: clientLocalUuid,
                    payload,
                    created_at: new Date().toISOString(),
                    status: 'pending',
                    preview: {
                        client_label: `${selectedClient.first_name} ${selectedClient.last_name}`,
                        total_amount: grandTotal,
                        items_count: cart.length,
                    },
                });
                syncEvents.dispatchEvent(new Event('change'));
                setFeedback(t('order.submittedOffline'));
                resetForm();
            }
        } finally {
            setSubmitting(false);
        }
    }

    function resetForm() {
        setCart([]);
        setSelectedClient(null);
        setClientQuery('');
        setIsExpress(false);
        setNotes('');
        setExpandedLine(null);
        setDiscount(0);
        setDiscountEdited(false);
    }

    function toggleIntakeCondition(serviceId: number, conditionId: number) {
        setCart((current) =>
            current.map((l) => {
                if (l.service_id !== serviceId) return l;
                const has = l.intake_condition_ids.includes(conditionId);
                return {
                    ...l,
                    intake_condition_ids: has
                        ? l.intake_condition_ids.filter((id) => id !== conditionId)
                        : [...l.intake_condition_ids, conditionId],
                };
            }),
        );
    }

    const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
    const hasInvalidWeight = cart.some((l) => l.weight_kg !== null && l.weight_kg <= 0);
    const submitHint = !selectedClient
        ? t('order.hintClient')
        : cart.length === 0
          ? t('order.hintItems')
          : hasInvalidWeight
            ? t('order.hintWeight')
            : null;

    // Le catalogue peut compter plusieurs centaines de services : regroupés par
    // catégorie, et sans recherche limités par catégorie, pour garder l'écran
    // de comptoir utilisable.
    const SERVICE_PREVIEW_LIMIT_PER_CATEGORY = 9;
    const trimmedServiceQuery = serviceQuery.trim().toLowerCase();
    const filteredServices = useMemo(() => {
        if (!trimmedServiceQuery) return services;
        return services.filter(
            (s) => s.name.toLowerCase().includes(trimmedServiceQuery) || s.code.toLowerCase().includes(trimmedServiceQuery),
        );
    }, [services, trimmedServiceQuery]);
    const groupedServices = useMemo(() => {
        const groups = new Map<string, typeof filteredServices>();
        for (const service of filteredServices) {
            const list = groups.get(service.category) ?? [];
            list.push(service);
            groups.set(service.category, list);
        }
        return SERVICE_CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => {
            const items = groups.get(category)!;
            const visible = trimmedServiceQuery ? items : items.slice(0, SERVICE_PREVIEW_LIMIT_PER_CATEGORY);
            return { category, items: visible, hiddenCount: items.length - visible.length };
        });
    }, [filteredServices, trimmedServiceQuery]);

    return (
        <div className="space-y-6">
            <PageHeader title={t('order.new')} subtitle={t('order.newSubtitle')} icon={ShoppingBag} />

            {feedback && <Alert tone="success">{feedback}</Alert>}
            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-w-0 space-y-6">
                    <section aria-labelledby="client-heading" className={cardPadded}>
                        <StepHeading id="client-heading" step={1} title={t('order.client')} />

                        {selectedClient ? (
                            <div className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-400/25 dark:bg-brand-400/5">
                                <Avatar firstName={selectedClient.first_name} lastName={selectedClient.last_name} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-ink-900 dark:text-ink-50">
                                        {selectedClient.first_name} {selectedClient.last_name}
                                    </p>
                                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600 dark:text-ink-350">
                                        <span className="inline-flex items-center gap-1">
                                            <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                                            {selectedClient.phone}
                                        </span>
                                        <Pill tone="accent" icon={Award}>
                                            {t('client.pointsCount', { count: selectedClient.loyalty_points })}
                                        </Pill>
                                        {selectedClient.loyalty_tier_name && (
                                            <Pill tone="amber" icon={Star}>
                                                {selectedClient.loyalty_tier_name}
                                            </Pill>
                                        )}
                                    </p>
                                </div>
                                <button type="button" onClick={() => setSelectedClient(null)} className={button('secondary', 'sm')}>
                                    <X aria-hidden="true" className="h-4 w-4" />
                                    {t('order.changeClient')}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <label htmlFor="client-search" className="sr-only">
                                    {t('client.search')}
                                </label>
                                <div className="relative">
                                    <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        id="client-search"
                                        type="search"
                                        placeholder={t('client.search')}
                                        value={clientQuery}
                                        onChange={(e) => setClientQuery(e.target.value)}
                                        className={cx(inputLg, 'pl-12')}
                                    />
                                </div>
                                {clientQuery.length >= 2 && (
                                    <ul className="max-h-64 animate-fade-in divide-y divide-ink-100 overflow-auto rounded-xl border border-ink-200 bg-white shadow-pop dark:divide-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:shadow-none">
                                        {clientResults.length === 0 && (
                                            <li>
                                                <EmptyState compact icon={SearchX} title={t('client.noResults')} description={t('client.noResultsHint')} />
                                            </li>
                                        )}
                                        {clientResults.map((client) => (
                                            <li key={client.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedClient(client)}
                                                    className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-brand-50 focus-visible:bg-brand-50 dark:hover:bg-brand-400/10 dark:focus-visible:bg-brand-400/10"
                                                >
                                                    <Avatar firstName={client.first_name} lastName={client.last_name} size="sm" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">
                                                            {client.first_name} {client.last_name}
                                                        </span>
                                                        <span className="block text-sm text-ink-600 dark:text-ink-350">{client.phone}</span>
                                                    </span>
                                                    <ChevronRight aria-hidden="true" className="h-5 w-5 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-700 dark:group-hover:text-brand-300" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </section>

                    <section aria-labelledby="services-heading" className={cardPadded}>
                        <StepHeading id="services-heading" step={2} title={t('order.service')} hint={t('order.servicesHint')} />

                        {!agencyId ? (
                            <EmptyState icon={Building2} title={t('order.selectAgency')} description={t('order.selectAgencyHint')} />
                        ) : services.length === 0 ? (
                            <EmptyState icon={Tag} title={t('order.noServices')} />
                        ) : (
                            <div className="space-y-3">
                                <label htmlFor="service-search" className="sr-only">
                                    {t('order.searchService')}
                                </label>
                                <div className="relative">
                                    <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                    <input
                                        id="service-search"
                                        type="search"
                                        placeholder={t('order.searchService')}
                                        value={serviceQuery}
                                        onChange={(e) => setServiceQuery(e.target.value)}
                                        className={cx(inputLg, 'pl-12')}
                                    />
                                </div>

                                {filteredServices.length === 0 ? (
                                    <EmptyState compact icon={SearchX} title={t('order.noServiceResults')} />
                                ) : (
                                    <div className="space-y-5">
                                        {groupedServices.map(({ category, items, hiddenCount }) => {
                                            const categoryKey = `service.category.${category}`;
                                            const categoryLabel = t(categoryKey) === categoryKey ? category : t(categoryKey);
                                            return (
                                                <div key={category}>
                                                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-600 dark:text-ink-350">
                                                        {categoryLabel}
                                                    </h3>
                                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                                                        {items.map((service) => (
                                                            <ServiceCard
                                                                key={service.id}
                                                                service={service}
                                                                inCart={cart.find((l) => l.service_id === service.id)?.quantity ?? 0}
                                                                onAdd={() => addLine(service.id)}
                                                            />
                                                        ))}
                                                    </div>
                                                    {hiddenCount > 0 && (
                                                        <p className="mt-2 text-xs text-ink-600 dark:text-ink-350">
                                                            {t('order.moreServicesHint', { shown: items.length, total: items.length + hiddenCount })}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>

                <aside
                    aria-labelledby="cart-heading"
                    className={cx(card, 'flex flex-col overflow-hidden md:sticky md:top-20 md:max-h-[calc(100vh-9rem)] md:min-h-[26rem]')}
                >
                    <div className="flex items-center justify-between gap-2 border-b border-ink-200/80 px-5 py-3.5 dark:border-ink-800">
                        <h2 id="cart-heading" className="flex scroll-mt-40 items-center gap-2 font-display text-base font-bold text-ink-900 dark:text-ink-50">
                            <Receipt aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                            {t('order.items')}
                        </h2>
                        <Pill tone={cartCount > 0 ? 'brand' : 'neutral'}>{t('order.itemsCount', { count: cartCount })}</Pill>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {cart.length === 0 ? (
                            <EmptyState compact icon={ShoppingBasket} title={t('order.cartEmpty')} description={t('order.cartEmptyHint')} />
                        ) : (
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {cart.map((line) => {
                                    const service = services.find((s) => s.id === line.service_id);
                                    const treatmentType = treatmentTypes.find((t) => t.id === line.treatment_type_id);
                                    return (
                                        <li key={line.service_id} className="animate-fade-in space-y-2.5 px-5 py-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-semibold leading-snug text-ink-900 dark:text-ink-50">{service?.name}</p>
                                                    <p className="text-xs tabular-nums text-ink-600 dark:text-ink-350">
                                                        {line.weight_kg !== null
                                                            ? t('order.weightKg', { weight: line.weight_kg })
                                                            : `${money(service?.effective_price ?? 0)} × ${line.quantity}`}
                                                        {treatmentType && ` · ${treatmentType.name}`}
                                                    </p>
                                                </div>
                                                <p className="shrink-0 font-display font-bold tabular-nums text-ink-900 dark:text-white">
                                                    {money(lineTotal(service, treatmentType, line))}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
                                                {line.weight_kg !== null ? (
                                                    <label className="inline-flex items-center gap-1.5">
                                                        <input
                                                            type="number"
                                                            min={0.01}
                                                            step={0.01}
                                                            value={line.weight_kg || ''}
                                                            aria-label={t('order.weight')}
                                                            placeholder={t('order.weight')}
                                                            onChange={(e) => updateLine(line.service_id, { weight_kg: Math.max(0, Number(e.target.value)) })}
                                                            className={cx(inputSm, 'h-10 w-24')}
                                                        />
                                                        <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">kg</span>
                                                    </label>
                                                ) : (
                                                    <div className="inline-flex items-center rounded-xl border border-ink-400 bg-white dark:border-ink-500 dark:bg-ink-950">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateLine(line.service_id, { quantity: Math.max(1, line.quantity - 1) })}
                                                            disabled={line.quantity <= 1}
                                                            aria-label={t('common.decrease')}
                                                            className="flex h-10 w-10 items-center justify-center rounded-l-xl text-ink-700 transition hover:bg-ink-100 active:scale-95 disabled:opacity-40 dark:text-ink-200 dark:hover:bg-ink-800"
                                                        >
                                                            <Minus aria-hidden="true" className="h-4 w-4" />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={line.quantity}
                                                            aria-label={t('common.quantity')}
                                                            onChange={(e) => updateLine(line.service_id, { quantity: Math.max(1, Number(e.target.value)) })}
                                                            className="h-10 w-12 border-x border-ink-200 bg-transparent text-center font-semibold tabular-nums text-ink-900 [appearance:textfield] focus:outline-none dark:border-ink-700 dark:text-ink-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => updateLine(line.service_id, { quantity: line.quantity + 1 })}
                                                            aria-label={t('common.increase')}
                                                            className="flex h-10 w-10 items-center justify-center rounded-r-xl text-ink-700 transition hover:bg-ink-100 active:scale-95 dark:text-ink-200 dark:hover:bg-ink-800"
                                                        >
                                                            <Plus aria-hidden="true" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                                {service?.billing_mode === 'mixte' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleWeightBilling(line.service_id)}
                                                        className={button('ghost', 'sm')}
                                                    >
                                                        {line.weight_kg !== null ? t('order.billByPiece') : t('order.billByWeight')}
                                                    </button>
                                                )}
                                                <input
                                                    type="text"
                                                    placeholder={t('order.itemDescription')}
                                                    aria-label={t('order.itemDescription')}
                                                    value={line.description}
                                                    onChange={(e) => updateLine(line.service_id, { description: e.target.value })}
                                                    className={cx(inputSm, 'order-last h-10 min-w-0 basis-full lg:order-none lg:basis-auto lg:flex-1')}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeLine(line.service_id)}
                                                    aria-label={t('order.removeItem')}
                                                    title={t('order.removeItem')}
                                                    className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-700 transition hover:bg-red-50 active:scale-95 lg:ml-0 dark:text-red-300 dark:hover:bg-red-400/10"
                                                >
                                                    <Trash2 aria-hidden="true" className="h-[18px] w-[18px]" />
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setExpandedLine((current) => (current === line.service_id ? null : line.service_id))}
                                                className="flex w-full items-center gap-1.5 text-xs font-semibold text-ink-600 transition hover:text-ink-900 dark:text-ink-350 dark:hover:text-white"
                                            >
                                                <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />
                                                {t('intake.toggle')}
                                                {line.intake_condition_ids.length > 0 && (
                                                    <Pill tone="amber">{line.intake_condition_ids.length}</Pill>
                                                )}
                                                <ChevronDown
                                                    aria-hidden="true"
                                                    className={cx('ml-auto h-4 w-4 transition-transform', expandedLine === line.service_id && 'rotate-180')}
                                                />
                                            </button>

                                            {expandedLine === line.service_id && (
                                                <div className="animate-fade-in space-y-2.5 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/50">
                                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('intake.hint')}</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {intakeConditions.map((condition) => {
                                                            const checked = line.intake_condition_ids.includes(condition.id);
                                                            return (
                                                                <button
                                                                    key={condition.id}
                                                                    type="button"
                                                                    aria-pressed={checked}
                                                                    onClick={() => toggleIntakeCondition(line.service_id, condition.id)}
                                                                    className={cx(
                                                                        'inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition duration-150',
                                                                        checked
                                                                            ? 'bg-amber-600 text-white dark:bg-amber-400 dark:text-ink-950'
                                                                            : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-100 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
                                                                    )}
                                                                >
                                                                    {condition.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <label className="block">
                                                        <span className={cx(label, 'mb-1')}>{t('intake.notes')}</span>
                                                        <input
                                                            type="text"
                                                            placeholder={t('intake.notesPlaceholder')}
                                                            value={line.intake_notes}
                                                            onChange={(e) => updateLine(line.service_id, { intake_notes: e.target.value })}
                                                            className={cx(inputSm, 'w-full')}
                                                        />
                                                    </label>
                                                    {treatmentTypes.length > 0 && (
                                                        <div>
                                                            <span className={cx(label, 'mb-1 block')}>{t('order.treatmentType')}</span>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {treatmentTypes.map((treatment) => {
                                                                    const checked = line.treatment_type_id === treatment.id;
                                                                    const premium = treatment.price_ratio > 1;
                                                                    return (
                                                                        <button
                                                                            key={treatment.id}
                                                                            type="button"
                                                                            aria-pressed={checked}
                                                                            onClick={() => setLineTreatmentType(line.service_id, treatment.id)}
                                                                            className={cx(
                                                                                'inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition duration-150',
                                                                                checked && premium
                                                                                    ? 'bg-accent-500 text-ink-950 dark:bg-accent-400 dark:text-ink-950'
                                                                                    : checked
                                                                                      ? 'bg-brand-700 text-white dark:bg-brand-400 dark:text-ink-950'
                                                                                      : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-100 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
                                                                            )}
                                                                        >
                                                                            {treatment.name}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="space-y-3 border-t border-ink-200/80 bg-ink-50/70 px-5 py-4 dark:border-ink-800 dark:bg-ink-950/40">
                        <label
                            className={cx(
                                'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/25',
                                isExpress
                                    ? 'border-accent-300 bg-accent-50 dark:border-accent-400/40 dark:bg-accent-400/10'
                                    : 'border-ink-200 bg-white hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900',
                            )}
                        >
                            <span
                                className={cx(
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
                                    isExpress ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                                )}
                            >
                                <Zap aria-hidden="true" className="h-[18px] w-[18px]" />
                            </span>
                            <span className="flex-1 text-sm font-semibold text-ink-900 dark:text-ink-50">{t('order.express')}</span>
                            <input type="checkbox" checked={isExpress} onChange={(e) => setIsExpress(e.target.checked)} className="peer sr-only" />
                            <span
                                aria-hidden="true"
                                className={cx(
                                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                                    isExpress ? 'bg-accent-600 dark:bg-accent-400' : 'bg-ink-400 dark:bg-ink-500',
                                )}
                            >
                                <span
                                    className={cx(
                                        'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                        isExpress && 'translate-x-5',
                                    )}
                                />
                            </span>
                        </label>

                        <label className="relative block">
                            <span className="sr-only">{t('common.notes')}</span>
                            <StickyNote aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                            <input
                                type="text"
                                placeholder={t('common.notes')}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className={cx(inputSm, 'h-10 pl-9')}
                            />
                        </label>

                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-ink-600 dark:text-ink-350">{t('order.subtotal')}</span>
                            <span className="tabular-nums font-semibold text-ink-800 dark:text-ink-100">{money(total)}</span>
                        </div>

                        <label className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('order.discount')}</span>
                            <span className="relative">
                                <input
                                    type="number"
                                    min={0}
                                    max={total}
                                    value={discount}
                                    onChange={(e) => {
                                        setDiscountEdited(true);
                                        setDiscount(Math.max(0, Math.min(total, Number(e.target.value))));
                                    }}
                                    className={cx(inputSm, 'h-9 w-28 text-right tabular-nums')}
                                />
                            </span>
                        </label>

                        {taxRate > 0 && (
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="text-ink-600 dark:text-ink-350">{t('order.tax', { rate: Math.round(taxRate * 100) })}</span>
                                <span className="tabular-nums font-semibold text-ink-800 dark:text-ink-100">{money(taxAmount)}</span>
                            </div>
                        )}

                        <div className="flex items-end justify-between gap-3 border-t border-ink-200/80 pt-3 dark:border-ink-800">
                            <span className="text-sm font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">{t('order.totalTtc')}</span>
                            <span className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white" aria-live="polite">
                                {money(grandTotal)}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => void handleSubmit()}
                            disabled={!selectedClient || cart.length === 0 || submitting || hasInvalidWeight}
                            className={button('primary', 'lg', 'w-full text-lg')}
                        >
                            {submitting ? <Spinner className="h-5 w-5" /> : <Check aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />}
                            {t('order.submit')}
                        </button>
                        {submitHint && <p className="text-center text-xs text-ink-600 dark:text-ink-350">{submitHint}</p>}
                    </div>
                </aside>
            </div>

            {cart.length > 0 && (
                <>
                    {/* Récapitulatif flottant sur téléphone : le ticket se trouve sous le catalogue. */}
                    <div aria-hidden="true" className="h-20 md:hidden" />
                    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-pop backdrop-blur md:hidden dark:border-ink-800 dark:bg-ink-900/95">
                        <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-ink-600 dark:text-ink-350">{t('order.itemsCount', { count: cartCount })}</p>
                                <p className="font-display text-xl font-extrabold tabular-nums text-ink-900 dark:text-white">{money(grandTotal)}</p>
                            </div>
                            <a href="#cart-heading" className={button('primary', 'md')}>
                                <Receipt aria-hidden="true" className="h-4 w-4" />
                                {t('order.viewTicket')}
                            </a>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function ServiceCard({
    service,
    inCart,
    onAdd,
}: {
    service: Service & { effective_price: number };
    inCart: number;
    onAdd: () => void;
}) {
    const { t } = useI18n();
    const { money } = useFormat();
    const meta = categoryMeta(service.category);
    const Icon = meta.icon;

    return (
        <button
            type="button"
            onClick={onAdd}
            className={cx(
                'group relative flex min-h-[7rem] flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition duration-150 active:scale-[0.97]',
                inCart > 0
                    ? 'border-brand-600 bg-brand-50/70 shadow-card-hover dark:border-brand-300 dark:bg-brand-400/10'
                    : 'border-ink-200/80 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-400/50',
            )}
        >
            <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset', TONES[meta.tone])}>
                <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-ink-900 dark:text-ink-50">{service.name}</span>
            </span>
            <span className="font-display text-lg font-bold tabular-nums text-brand-700 dark:text-brand-300">{money(service.effective_price)}</span>
            {inCart > 0 ? (
                <span
                    key={inCart}
                    className="absolute right-3 top-3 flex h-7 min-w-7 animate-pop-in items-center justify-center rounded-full bg-brand-600 px-2 text-sm font-bold text-white shadow-brand dark:bg-brand-300 dark:text-ink-950 dark:shadow-none"
                >
                    {inCart}
                    <span className="sr-only">{t('order.inCart', { count: inCart })}</span>
                </span>
            ) : (
                <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-ink-600 opacity-0 transition group-hover:opacity-100 dark:bg-ink-800 dark:text-ink-300">
                    <Plus aria-hidden="true" className="h-4 w-4" />
                </span>
            )}
        </button>
    );
}

function StepHeading({ id, step, title, hint }: { id: string; step: number; title: string; hint?: string }) {
    return (
        <div className="mb-4 flex items-center gap-3">
            <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-sm font-bold text-white dark:bg-brand-400 dark:text-ink-950"
            >
                {step}
            </span>
            <div className="min-w-0">
                <h2 id={id} className={sectionTitle}>
                    {title}
                </h2>
                {hint && <p className="text-xs text-ink-600 dark:text-ink-350">{hint}</p>}
            </div>
        </div>
    );
}
