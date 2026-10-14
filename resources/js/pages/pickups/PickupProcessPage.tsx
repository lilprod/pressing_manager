import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Info, Lock, PackageCheck, Printer, ScrollText, Send, UserRound, Users, Wifi, WifiOff } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { auditLogLabel } from '../../lib/auditLog';
import PrintableTicket from '../../components/PrintableTicket';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import PaymentReferenceField from '../../components/PaymentReferenceField';
import { Avatar } from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill, type Tone as PillTone } from '../../components/ui/StatusBadge';
import Toggle from '../../components/ui/Toggle';
import { useLastSyncedAt, useOnlineStatus } from '../../lib/useOnlineStatus';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cardPadded, cx, input, label, sectionTitle, textLink } from '../../components/ui/styles';
import type { AuditLog, Order, OrderItemStatus, PaymentMethod, PickupConditionStatus, PickupRecipientType } from '../../types';
import { itemPrestationLabel } from '../../lib/orderItem';

/* Écran « Traiter le retrait » (Figma SPARK PRESSING, section 05, « Retraits en
 * agence ») — mise en page deux colonnes, chronologie atelier et journal d'audit
 * réutilisent exactement les mêmes données/composants que OrderDetail.tsx (même
 * endpoint GET /orders/{id}, déjà chargé avec items.statusHistories/client/agency/
 * creator — aucun nouvel appel backend nécessaire pour ces deux sections). */

const CONDITIONS: PickupConditionStatus[] = ['conforme', 'reserve', 'anomalie'];

/** Frise atelier : les vrais statuts successifs d'un dépôt, du dépôt à la remise. */
const STEP_STATUSES: OrderItemStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre'];

/** Colonne « Vérification » : état atelier réel de l'article au moment du retrait. */
const ITEM_VERIFICATION: Partial<Record<OrderItemStatus, { tone: PillTone; label: string }>> = {
    pret: { tone: 'emerald', label: 'pickup.verification.ready' },
    controle_qualite: { tone: 'amber', label: 'pickup.verification.qualityCheck' },
    non_recupere: { tone: 'rose', label: 'pickup.verification.notCollected' },
};

function InfoColumn({ label: title, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{title}</p>
            <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{value}</p>
            {hint && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
        </div>
    );
}

export default function PickupProcessPage() {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, date, dateTime, time } = useFormat();
    const online = useOnlineStatus();
    const lastSyncedAt = useLastSyncedAt();

    const [order, setOrder] = useState<Order | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [recipientType, setRecipientType] = useState<PickupRecipientType>('client');
    const [recipientName, setRecipientName] = useState('');
    const [condition, setCondition] = useState<PickupConditionStatus>('conforme');
    const [conditionNotes, setConditionNotes] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('espece');
    const [paymentReference, setPaymentReference] = useState('');
    const [overrideUnpaid, setOverrideUnpaid] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [printReceiptAfter, setPrintReceiptAfter] = useState(true);
    const [notifyAfter, setNotifyAfter] = useState(true);
    const [showTimelineDetails, setShowTimelineDetails] = useState(false);
    const [showFullAudit, setShowFullAudit] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!orderId) return;
        setLoading(true);
        api
            .get<Order>(`/orders/${orderId}`)
            .then((res) => {
                setOrder(res);
                const client = res.client;
                if (client) setRecipientName(`${client.first_name} ${client.last_name}`);
                const initial: Record<number, number> = {};
                res.items
                    .filter((item) => ['pret', 'non_recupere', 'controle_qualite'].includes(item.status))
                    .forEach((item) => {
                        const remaining = item.quantity - item.quantity_delivered;
                        if (remaining > 0) initial[item.id] = remaining;
                    });
                setQuantities(initial);
            })
            .catch(() => setOrder(null))
            .finally(() => setLoading(false));
        api
            .get<AuditLog[]>(`/orders/${orderId}/audit-logs`)
            .then(setAuditLogs)
            .catch(() => setAuditLogs([]));
    }, [orderId]);

    const eligibleItems = useMemo(
        () => (order?.items ?? []).filter((item) => ['pret', 'non_recupere', 'controle_qualite'].includes(item.status) && item.quantity - item.quantity_delivered > 0),
        [order],
    );

    const workshopTimeline = useMemo<TimelineEntry[]>(() => {
        if (!order) return [];
        const entries: TimelineEntry[] = order.items.flatMap(
            (item) =>
                item.status_histories?.map((h) => ({
                    id: `history-${h.id}`,
                    label: t('order.timeline.itemStatus', { item: item.service?.name ?? t('order.item'), status: t(`status.${h.to_status}`) }),
                    detail: h.notes ?? undefined,
                    at: h.changed_at,
                    actor: h.actor?.name ?? null,
                })) ?? [],
        );
        entries.push({ id: 'order-created', label: t('order.timeline.created'), at: order.created_at, actor: order.creator?.name ?? null });
        return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [order, t]);

    const auditTimeline = useMemo<TimelineEntry[]>(
        () => auditLogs.map((log) => ({ id: log.id, label: auditLogLabel(log, t, money), at: log.created_at, actor: log.user?.name ?? t('order.audit.systemActor') })),
        [auditLogs, t, money],
    );

    const balanceDue = useMemo(() => {
        if (!order?.invoice) return 0;
        return order.invoice.reduce((sum, invoice) => {
            const paid = (invoice.payments ?? []).filter((p) => p.status === 'complete').reduce((s, p) => s + p.amount, 0);
            return sum + Math.max(0, invoice.total_amount - paid);
        }, 0);
    }, [order]);

    const received = Number(paymentAmount) || 0;
    // Montant réellement encaissé : jamais au-delà du solde ; l'excédent d'espèces est
    // de la monnaie rendue (non persistée), comme au comptoir.
    const collected = Math.min(received, balanceDue);
    const changeDue = paymentMethod === 'espece' ? Math.max(0, received - balanceDue) : 0;
    // V1, en attendant une intégration réelle avec un agrégateur (voir CLAUDE.md) :
    // carte/Flooz/T-Money sont confirmés manuellement par le caissier exactement
    // comme l'espèce (débloquent le solde immédiatement), à condition qu'une
    // référence de transaction soit saisie comme preuve/traçabilité.
    const remainingAfterPayment = Math.max(0, balanceDue - collected);
    const needsOverride = remainingAfterPayment > 0;
    const referenceRequired = paymentMethod !== 'espece' && collected > 0;
    const referenceMissing = referenceRequired && paymentReference.trim() === '';

    // Étapes de la frise : date du premier passage réel d'un article à chaque statut.
    const steps = useMemo(() => {
        if (!order) return [];
        const currentIndex = STEP_STATUSES.indexOf(order.status as OrderItemStatus);
        return STEP_STATUSES.map((status, index) => {
            const at =
                status === 'recu'
                    ? order.created_at
                    : (order.items
                          .flatMap((item) => item.status_histories ?? [])
                          .filter((h) => h.to_status === status)
                          .map((h) => h.changed_at)
                          .sort()[0] ?? null);
            return { status, at, reached: index <= currentIndex || at !== null, current: index === currentIndex };
        });
    }, [order]);

    function setQuantity(itemId: number, value: number, max: number) {
        setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(max, value)) }));
    }

    const selectedCount = Object.values(quantities).filter((q) => q > 0).length;
    const totalPieces = eligibleItems.reduce((sum, item) => sum + item.quantity - item.quantity_delivered, 0);
    const selectedPieces = Object.values(quantities).reduce((sum, q) => sum + q, 0);
    const isFullPickup = totalPieces > 0 && selectedPieces === totalPieces;

    // Bascule « Retrait total / Retrait partiel » (capture Figma) : total = toutes les
    // pièces restantes ; partiel = on repart de zéro et l'on choisit pièce par pièce.
    function selectAll() {
        const next: Record<number, number> = {};
        eligibleItems.forEach((item) => (next[item.id] = item.quantity - item.quantity_delivered));
        setQuantities(next);
    }

    const [notifying, setNotifying] = useState(false);
    const [notifyFeedback, setNotifyFeedback] = useState<string | null>(null);
    async function notifyClient() {
        if (!order) return;
        setNotifying(true);
        setNotifyFeedback(null);
        try {
            const result = await api.post<{ sent: number }>(`/orders/${order.id}/notify-ready`, {});
            setNotifyFeedback(result.sent > 0 ? t('pickup.notifySent', { count: result.sent }) : t('pickup.notifyNone'));
        } catch (err) {
            setNotifyFeedback(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setNotifying(false);
        }
    }
    const canSubmit =
        !busy &&
        selectedCount > 0 &&
        recipientName.trim() !== '' &&
        !referenceMissing &&
        (!needsOverride || (overrideUnpaid && overrideReason.trim() !== ''));

    useEffect(() => {
        if (printing) {
            const timeout = setTimeout(() => window.print(), 100);
            return () => clearTimeout(timeout);
        }
    }, [printing]);

    async function handleSubmit() {
        if (!order) return;
        setBusy(true);
        setError(null);
        try {
            await api.post(`/orders/${order.id}/pickups`, {
                recipient_type: recipientType,
                recipient_name: recipientName,
                condition_status: condition,
                condition_notes: conditionNotes || null,
                items: Object.entries(quantities)
                    .filter(([, qty]) => qty > 0)
                    .map(([itemId, qty]) => ({ order_item_id: Number(itemId), quantity: qty })),
                payment_amount: collected > 0 ? collected : undefined,
                payment_method: collected > 0 ? paymentMethod : undefined,
                payment_reference: referenceRequired ? paymentReference.trim() : undefined,
                override_unpaid: needsOverride ? overrideUnpaid : undefined,
                override_reason: needsOverride && overrideUnpaid ? overrideReason : undefined,
                notify_client: notifyAfter,
            });
            if (printReceiptAfter) {
                navigate(`/orders/${order.id}/documents`);
            } else {
                navigate('/pickups');
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <LoadingState />;

    if (!order) {
        return <EmptyState icon={PackageCheck} title={t('pickup.notFound')} />;
    }

    const orderNumber = order.order_number_formatted ?? String(order.order_number);
    const totalDue = (order.invoice ?? []).reduce((sum, invoice) => sum + invoice.total_amount, 0);
    const alreadyPaid = Math.max(0, totalDue - balanceDue);
    const allPieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const treatmentNames = [...new Set(order.items.map((item) => item.treatment_type?.name).filter(Boolean))];
    const workshopDone = order.items.length > 0 && order.items.every((item) => ['pret', 'livre', 'non_recupere'].includes(item.status));
    const blocked = balanceDue > 0 && needsOverride && !(overrideUnpaid && overrideReason.trim() !== '');
    const recentAudit = auditTimeline.slice(0, 3);

    const segment = (active: boolean) =>
        cx(
            'flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
            active
                ? 'border-accent-300 bg-accent-50 text-ink-900 dark:border-accent-400/40 dark:bg-accent-400/10 dark:text-accent-200'
                : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
        );

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('pickup.processHeading')}</h1>
                        <Pill tone="accent">{orderNumber}</Pill>
                        {selectedPieces > 0 && <Pill tone={isFullPickup ? 'emerald' : 'sky'}>{isFullPickup ? t('pickup.full') : t('pickup.partial')}</Pill>}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('pickup.processSubtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/pickups" className={button('secondary', 'sm')}>
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                        {t('pickup.backToList')}
                    </Link>
                    <button type="button" onClick={() => setPrinting(true)} className={button('secondary', 'sm')}>
                        <Printer aria-hidden="true" className="h-4 w-4" />
                        {t('pickup.printReceipt')}
                    </button>
                    <button type="button" onClick={() => void notifyClient()} disabled={notifying} className={button('secondary', 'sm')}>
                        {notifying ? <Spinner className="h-4 w-4" /> : <Send aria-hidden="true" className="h-4 w-4" />}
                        {t('pickup.notify')}
                    </button>
                </div>
            </header>

            <section className={cx(cardPadded, 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto] xl:items-center')}>
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="md" />
                    <div className="min-w-0">
                        {order.client_id ? (
                            <Link to={`/clients/${order.client_id}`} className="block truncate font-semibold text-ink-900 hover:underline dark:text-white">
                                {order.client?.first_name} {order.client?.last_name}
                            </Link>
                        ) : null}
                        <p className="truncate text-xs text-ink-600 dark:text-ink-350">
                            {[order.client?.phone, order.client?.created_at ? t('pickup.clientSince', { date: date(order.client.created_at) }) : null].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                </div>
                <InfoColumn label={t('pickup.info.deposit')} value={orderNumber} hint={t('pickup.info.depositedOn', { date: dateTime(order.created_at) })} />
                <InfoColumn label={t('pickup.info.agency')} value={order.agency?.name ?? '—'} hint={order.agency?.city ?? undefined} />
                <InfoColumn
                    label={t('pickup.info.order')}
                    value={[t('pickup.piecesCount', { count: allPieces }), ...treatmentNames].join(' · ')}
                    hint={order.promised_at ? t('pickup.promisedAt', { date: dateTime(order.promised_at) }) : t('pickup.noPromisedDate')}
                />
                <InfoColumn label={t('pickup.info.total')} value={money(order.total_amount)} hint={totalDue > 0 ? t('pickup.info.paidSoFar', { amount: money(alreadyPaid) }) : t('pickup.info.notInvoiced')} />
                <div className="flex flex-wrap gap-1.5 sm:col-span-2 xl:col-span-1 xl:flex-col xl:items-end">
                    <Pill tone={workshopDone ? 'emerald' : 'amber'}>{workshopDone ? t('pickup.workshopDone') : t(`status.${order.status}`)}</Pill>
                    {balanceDue > 0 && <Pill tone="accent">{t('pickup.amountDue', { amount: money(balanceDue) })}</Pill>}
                </div>
            </section>

            <section aria-labelledby="pickup-timeline-heading" className={cx(cardPadded, 'space-y-4')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h2 id="pickup-timeline-heading" className={sectionTitle}>
                            {t('order.timeline.title')}
                        </h2>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.timelineSubtitle')}</p>
                    </div>
                    <button type="button" onClick={() => setShowTimelineDetails((v) => !v)} className={cx(textLink, 'text-sm')}>
                        {showTimelineDetails ? t('pickup.hideDetails') : t('pickup.showDetails')}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <ol className="flex min-w-[560px] items-start">
                        {steps.map((step, index) => (
                            <li key={step.status} className="relative flex flex-1 flex-col items-center text-center">
                                {index > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className={cx('absolute right-1/2 top-3 h-0.5 w-full', step.reached ? 'bg-emerald-500' : 'bg-ink-200 dark:bg-ink-700')}
                                    />
                                )}
                                <span
                                    className={cx(
                                        'relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-ink-900',
                                        step.current ? 'bg-accent-500' : step.reached ? 'bg-emerald-500' : 'bg-ink-200 dark:bg-ink-700',
                                    )}
                                >
                                    {step.reached && !step.current ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : step.current ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                                </span>
                                <span className="mt-2 text-xs font-semibold text-ink-900 dark:text-ink-50">{t(`status.${step.status}`)}</span>
                                <span className="text-[11px] text-ink-500 dark:text-ink-400">{step.at ? dateTime(step.at) : step.current ? t('pickup.stepNow') : t('pickup.stepUpcoming')}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                {showTimelineDetails && <Timeline entries={workshopTimeline} emptyLabel={t('order.timeline.empty')} />}
            </section>

            {error && <Alert tone="error">{error}</Alert>}
            {notifyFeedback && <Alert tone="info">{notifyFeedback}</Alert>}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-4">
                    {eligibleItems.length === 0 ? (
                        <section className={card}>
                            <EmptyState icon={PackageCheck} title={t('pickup.nothingToWithdraw')} />
                        </section>
                    ) : (
                        <section className={cx(card, 'overflow-hidden')}>
                            <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
                                <div>
                                    <h2 className={sectionTitle}>{t('pickup.itemsVerification')}</h2>
                                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.selectedOf', { selected: selectedPieces, total: totalPieces })}</p>
                                </div>
                                <p className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
                                    <Info aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('pickup.restStays')}
                                </p>
                            </div>
                            <div role="group" aria-label={t('pickup.mode')} className="mt-3 grid grid-cols-1 gap-2 px-5 sm:grid-cols-2">
                                <button type="button" onClick={selectAll} aria-pressed={isFullPickup} className={segment(isFullPickup)}>
                                    {t('pickup.modeFull', { count: totalPieces })}
                                </button>
                                <button type="button" onClick={() => setQuantities({})} aria-pressed={!isFullPickup} className={segment(!isFullPickup)}>
                                    {t('pickup.modePartial', { count: selectedPieces })}
                                </button>
                            </div>
                            <div className="mt-3 overflow-x-auto">
                                <div className="min-w-[720px]">
                                    <div
                                        role="row"
                                        className="flex items-center gap-4 border-y border-ink-200/80 bg-ink-50 px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                                    >
                                        <span className="w-8 shrink-0">{t('pickup.itemsTable.select')}</span>
                                        <span className="min-w-0 flex-1">{t('pickup.itemsTable.article')}</span>
                                        <span className="w-20 shrink-0">{t('pickup.itemsTable.total')}</span>
                                        <span className="w-32 shrink-0">{t('pickup.itemsTable.quantity')}</span>
                                        <span className="w-36 shrink-0 text-right">{t('pickup.itemsTable.status')}</span>
                                    </div>
                                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {eligibleItems.map((item) => {
                                            const remaining = item.quantity - item.quantity_delivered;
                                            const qty = quantities[item.id] ?? 0;
                                            const details = [
                                                itemPrestationLabel(item),
                                                ...(item.intake_conditions ?? []).map((c) => c.label),
                                                item.intake_notes,
                                                item.description,
                                            ].filter(Boolean);
                                            const verification = ITEM_VERIFICATION[item.status] ?? { tone: 'emerald' as PillTone, label: 'pickup.verification.ready' };
                                            return (
                                                <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                                                    <span className="w-8 shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={qty > 0}
                                                            onChange={(e) => setQuantity(item.id, e.target.checked ? remaining : 0, remaining)}
                                                            aria-label={t('pickup.selectItem', { item: item.service?.name ?? '' })}
                                                            className="h-4 w-4 rounded accent-emerald-600"
                                                        />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-ink-900 dark:text-ink-50">{item.service?.name ?? item.description}</p>
                                                        {details.length > 0 && <p className="truncate text-xs text-ink-600 dark:text-ink-350">{details.join(' · ')}</p>}
                                                    </div>
                                                    <p className="w-20 shrink-0 text-sm text-ink-600 dark:text-ink-350">
                                                        {t('pickup.piecesCount', { count: item.quantity })}
                                                        {item.quantity_delivered > 0 && <span className="block text-xs">{t('pickup.remaining', { count: remaining })}</span>}
                                                    </p>
                                                    <div className="flex w-32 shrink-0 items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setQuantity(item.id, qty - 1, remaining)}
                                                            className={button('secondary', 'sm', 'w-8 px-0')}
                                                            aria-label={t('common.decrease')}
                                                        >
                                                            −
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={remaining}
                                                            value={qty}
                                                            onChange={(e) => setQuantity(item.id, Number(e.target.value), remaining)}
                                                            className={cx(input, 'h-8 w-14 text-center')}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setQuantity(item.id, qty + 1, remaining)}
                                                            className={button('secondary', 'sm', 'w-8 px-0')}
                                                            aria-label={t('common.increase')}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <div className="w-36 shrink-0 text-right">
                                                        <Pill tone={verification.tone}>{t(verification.label)}</Pill>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm dark:border-emerald-400/20 dark:bg-emerald-400/10">
                                <span className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
                                    <PackageCheck aria-hidden="true" className="h-4 w-4" />
                                    {t('pickup.readyToHandOver', { count: selectedPieces })}
                                </span>
                                {totalPieces - selectedPieces > 0 && (
                                    <span className="text-xs text-ink-600 dark:text-ink-350">{t('pickup.staysAtAgency', { count: totalPieces - selectedPieces })}</span>
                                )}
                            </div>
                        </section>
                    )}

                    <section className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 className={sectionTitle}>{t('pickup.conditionTitle')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.conditionSubtitle')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {CONDITIONS.map((c) => (
                                <button key={c} type="button" onClick={() => setCondition(c)} aria-pressed={condition === c} className={segment(condition === c)}>
                                    {t(`pickup.conditionStatus.${c}`)}
                                </button>
                            ))}
                        </div>
                        <label className="block">
                            <span className={label}>{t('pickup.conditionNotes')}</span>
                            <textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} rows={3} className={cx(input, 'w-full')} />
                        </label>
                    </section>

                    <section className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 className={sectionTitle}>{t('pickup.recipient')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.recipientSubtitle')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setRecipientType('client')} aria-pressed={recipientType === 'client'} className={segment(recipientType === 'client')}>
                                <UserRound aria-hidden="true" className="h-4 w-4" />
                                {t('pickup.recipientClient')}
                            </button>
                            <button type="button" onClick={() => setRecipientType('tiers')} aria-pressed={recipientType === 'tiers'} className={segment(recipientType === 'tiers')}>
                                <Users aria-hidden="true" className="h-4 w-4" />
                                {t('pickup.recipientThirdParty')}
                            </button>
                        </div>
                        <label className="block">
                            <span className={label}>{t('pickup.recipientName')}</span>
                            <span className="relative block">
                                <UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-400" />
                                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={cx(input, 'w-full pl-9')} />
                            </span>
                        </label>
                    </section>

                    <section aria-labelledby="pickup-audit-heading" className={cx(cardPadded, 'space-y-4')}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h2 id="pickup-audit-heading" className={sectionTitle}>
                                    {t('order.audit.title')}
                                </h2>
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.auditSubtitle')}</p>
                            </div>
                            {auditTimeline.length > recentAudit.length && (
                                <button type="button" onClick={() => setShowFullAudit((v) => !v)} className={cx(textLink, 'text-sm')}>
                                    {showFullAudit ? t('pickup.auditCollapse') : t('pickup.auditFull')}
                                </button>
                            )}
                        </div>
                        {showFullAudit ? (
                            <Timeline entries={auditTimeline} emptyLabel={t('order.audit.empty')} />
                        ) : recentAudit.length === 0 ? (
                            <p className="text-sm text-ink-500 dark:text-ink-400">{t('order.audit.empty')}</p>
                        ) : (
                            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {recentAudit.map((entry) => (
                                    <li key={entry.id} className="flex min-w-0 items-start gap-2.5">
                                        <ScrollText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300" />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-ink-900 dark:text-ink-50">{entry.label}</span>
                                            <span className="block text-xs text-ink-500 dark:text-ink-400">
                                                {[entry.actor, time(entry.at)].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>

                <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                    <section className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 className={sectionTitle}>{t('pickup.balance')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.balanceSubtitle')}</p>
                        </div>
                        <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-2">
                                <dt className="text-ink-600 dark:text-ink-350">{t('pickup.depositTotal')}</dt>
                                <dd className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{money(order.total_amount)}</dd>
                            </div>
                            {totalDue > 0 && (
                                <div className="flex justify-between gap-2">
                                    <dt className="text-ink-600 dark:text-ink-350">{t('pickup.alreadyPaid')}</dt>
                                    <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">−{money(alreadyPaid)}</dd>
                                </div>
                            )}
                            <div className="flex items-baseline justify-between gap-2 border-t border-ink-100 pt-2 dark:border-ink-800">
                                <dt className="font-semibold text-ink-900 dark:text-ink-50">{t('pickup.amountRemaining')}</dt>
                                <dd className={cx('font-display text-2xl font-bold tabular-nums', balanceDue > 0 ? 'text-accent-700 dark:text-accent-300' : 'text-emerald-700 dark:text-emerald-300')}>
                                    {money(balanceDue)}
                                </dd>
                            </div>
                        </dl>
                        {balanceDue > 0 ? (
                            needsOverride && (
                                <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-400/30 dark:bg-red-400/5">
                                    <p className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
                                        <Lock aria-hidden="true" className="h-4 w-4" />
                                        {t('pickup.blockedTitle')}
                                    </p>
                                    <p className="text-xs text-red-800 dark:text-red-300">{t('pickup.blockedHint')}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => setPaymentAmount(String(balanceDue))} className={button('primary', 'sm')}>
                                            {t('pickup.collectNow', { amount: money(balanceDue) })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOverrideUnpaid((v) => !v)}
                                            aria-pressed={overrideUnpaid}
                                            className={cx(button('secondary', 'sm'), overrideUnpaid && 'ring-2 ring-red-400')}
                                        >
                                            {t('pickup.overrideButton')}
                                        </button>
                                    </div>
                                    {overrideUnpaid && (
                                        <label className="block">
                                            <span className={label}>{t('pickup.overrideReason')}</span>
                                            <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                                            <span className="mt-1 block text-xs text-red-800 dark:text-red-300">{t('pickup.override', { amount: money(remainingAfterPayment) })}</span>
                                        </label>
                                    )}
                                </div>
                            )
                        ) : (
                            <Alert tone="success">{t('pickup.balancePaid')}</Alert>
                        )}
                        {balanceDue > 0 && (
                            <>
                                <PaymentMethodPicker name="pickup-payment-method" value={paymentMethod} onChange={setPaymentMethod} layout="compact" />
                                <label className="block">
                                    <span className={label}>{t('pickup.amountReceived')}</span>
                                    <input type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={cx(input, 'w-full')} />
                                </label>
                                {paymentMethod === 'espece' && (
                                    <p className="flex justify-between text-sm">
                                        <span className="text-ink-600 dark:text-ink-350">{t('pickup.changeDue')}</span>
                                        <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{money(changeDue)}</span>
                                    </p>
                                )}
                                {referenceRequired && <PaymentReferenceField method={paymentMethod} value={paymentReference} onChange={setPaymentReference} />}
                            </>
                        )}
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div>
                            <h2 className={sectionTitle}>{t('pickup.afterConfirm.title')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.afterConfirm.subtitle')}</p>
                        </div>
                        <Toggle checked={printReceiptAfter} onChange={setPrintReceiptAfter} label={t('pickup.afterConfirm.print')} description={t('pickup.afterConfirm.printHint')} />
                        <Toggle checked={notifyAfter} onChange={setNotifyAfter} label={t('pickup.afterConfirm.notify')} description={t('pickup.afterConfirm.notifyHint')} />
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div>
                            <h2 className={sectionTitle}>{t('pickup.sync.title')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('pickup.sync.subtitle')}</p>
                        </div>
                        <div
                            className={cx(
                                'flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm',
                                online ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
                            )}
                        >
                            {online ? <Wifi aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
                            <span>
                                <span className="block font-semibold">{online ? t('pickup.sync.online') : t('pickup.sync.offline')}</span>
                                <span className="block text-xs">{lastSyncedAt ? t('pickup.sync.lastSync', { time: time(lastSyncedAt) }) : t('pickup.sync.neverSynced')}</span>
                            </span>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('pickup.sync.requiresNetwork')}</p>
                        {order.sync_status !== 'synced' && (
                            <Alert tone={order.sync_status === 'conflict' ? 'error' : 'warning'}>
                                {order.sync_status === 'pending' ? t('documents.offline.pending', { uuid: order.client_local_uuid ?? '—' }) : t('documents.offline.conflict')}
                            </Alert>
                        )}
                    </section>

                    <section className="space-y-3 rounded-2xl bg-brand-900 p-5 text-white shadow-lg">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className={cx('flex items-center gap-2', blocked ? 'text-accent-200' : 'text-brand-100/90')}>
                                <span className={cx('h-2 w-2 rounded-full', blocked ? 'bg-accent-400' : 'bg-emerald-400')} />
                                {blocked ? t('pickup.footer.paymentRequired') : t('pickup.footer.ready', { count: selectedPieces })}
                            </span>
                            {blocked && <span className="font-display font-bold tabular-nums">{money(remainingAfterPayment)}</span>}
                        </div>
                        <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit} className={cx(button('accent', 'md'), 'w-full justify-center')}>
                            {busy ? <Spinner className="h-4 w-4" /> : <PackageCheck aria-hidden="true" className="h-4 w-4" />}
                            {t('pickup.confirm')}
                        </button>
                        <p className="text-center text-xs text-brand-100/80">{t('pickup.footer.recorded')}</p>
                    </section>
                </div>
            </div>

            {printing && <PrintableTicket order={order} />}
        </div>
    );
}
