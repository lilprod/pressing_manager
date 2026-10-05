import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Building2,
    Check,
    Clock,
    Pencil,
    Phone,
    PackageCheck,
    Printer,
    ScrollText,
    UserRound,
    Users,
    WifiOff,
    Workflow,
} from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { auditLogLabel } from '../../lib/auditLog';
import PrintableTicket from '../../components/PrintableTicket';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import PaymentReferenceField from '../../components/PaymentReferenceField';
import { Avatar } from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cardPadded, cx, input, label, sectionTitle, textLink } from '../../components/ui/styles';
import type { AuditLog, Order, PaymentMethod, PickupConditionStatus, PickupRecipientType } from '../../types';

/* Écran « Traiter le retrait » (Figma SPARK PRESSING, section 05, « Retraits en
 * agence ») — mise en page deux colonnes, chronologie atelier et journal d'audit
 * réutilisent exactement les mêmes données/composants que OrderDetail.tsx (même
 * endpoint GET /orders/{id}, déjà chargé avec items.statusHistories/client/agency/
 * creator — aucun nouvel appel backend nécessaire pour ces deux sections). */

const CONDITIONS: PickupConditionStatus[] = ['conforme', 'reserve', 'anomalie'];

export default function PickupProcessPage() {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();

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
                    .filter((item) => ['pret', 'non_recupere'].includes(item.status))
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
        () => (order?.items ?? []).filter((item) => ['pret', 'non_recupere'].includes(item.status) && item.quantity - item.quantity_delivered > 0),
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

    const collected = Number(paymentAmount) || 0;
    // V1, en attendant une intégration réelle avec un agrégateur (voir CLAUDE.md) :
    // carte/Flooz/T-Money sont confirmés manuellement par le caissier exactement
    // comme l'espèce (débloquent le solde immédiatement), à condition qu'une
    // référence de transaction soit saisie comme preuve/traçabilité.
    const remainingAfterPayment = Math.max(0, balanceDue - collected);
    const needsOverride = remainingAfterPayment > 0;
    const referenceRequired = paymentMethod !== 'espece' && collected > 0;
    const referenceMissing = referenceRequired && paymentReference.trim() === '';

    function setQuantity(itemId: number, value: number, max: number) {
        setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(max, value)) }));
    }

    const selectedCount = Object.values(quantities).filter((q) => q > 0).length;
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

    return (
        <div className="max-w-6xl space-y-4">
            <Link to="/pickups" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('pickup.backToList')}
            </Link>

            <section className={cx(cardPadded, 'space-y-4')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">
                            {t('pickup.processTitle', { number: orderNumber })}
                        </h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">
                            {order.promised_at ? t('pickup.promisedAt', { date: dateTime(order.promised_at) }) : t('pickup.noPromisedDate')}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPrinting(true)} className={button('secondary', 'sm')}>
                            <Printer aria-hidden="true" className="h-4 w-4" />
                            {t('pickup.printReceipt')}
                        </button>
                        {order.client_id && (
                            <Link to={`/clients/${order.client_id}/edit`} className={button('secondary', 'sm')}>
                                <Pencil aria-hidden="true" className="h-4 w-4" />
                                {t('pickup.editClient')}
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-100 pt-4 dark:border-ink-800">
                    <div className="flex items-center gap-2.5">
                        <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" />
                        <span className="font-semibold text-ink-900 dark:text-white">
                            {order.client?.first_name} {order.client?.last_name}
                        </span>
                    </div>
                    {order.client?.phone && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                            <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                            {order.client.phone}
                        </span>
                    )}
                    {order.agency?.name && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                            <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                            {order.agency.name}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('pickup.depositedAt', { date: dateTime(order.created_at) })}
                    </span>
                </div>
            </section>

            <section aria-labelledby="pickup-timeline-heading" className={cx(cardPadded, 'space-y-4')}>
                <h2 id="pickup-timeline-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <Workflow aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('order.timeline.title')}
                </h2>
                <Timeline entries={workshopTimeline} emptyLabel={t('order.timeline.empty')} />
            </section>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    {eligibleItems.length === 0 ? (
                        <section className={card}>
                            <EmptyState icon={PackageCheck} title={t('pickup.nothingToWithdraw')} />
                        </section>
                    ) : (
                        <section className={cx(card, 'overflow-hidden')}>
                            <h2 className={cx(sectionTitle, 'px-5 pt-5')}>{t('pickup.itemsVerification')}</h2>
                            <div className="mt-3 overflow-x-auto">
                                <div className="min-w-[680px]">
                                    <div
                                        role="row"
                                        className="flex items-center gap-4 border-y border-ink-200/80 bg-ink-50 px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                                    >
                                        <span className="min-w-0 flex-1">{t('pickup.itemsTable.article')}</span>
                                        <span className="w-28 shrink-0">{t('pickup.itemsTable.remaining')}</span>
                                        <span className="w-32 shrink-0">{t('pickup.itemsTable.quantity')}</span>
                                        <span className="w-32 shrink-0 text-right">{t('pickup.itemsTable.status')}</span>
                                    </div>
                                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {eligibleItems.map((item) => {
                                            const remaining = item.quantity - item.quantity_delivered;
                                            const qty = quantities[item.id] ?? 0;
                                            return (
                                                <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                                                    <p className="min-w-0 flex-1 font-semibold text-ink-900 dark:text-ink-50">
                                                        {item.service?.name ?? item.description}
                                                    </p>
                                                    <p className="w-28 shrink-0 text-sm text-ink-600 dark:text-ink-350">{t('pickup.remaining', { count: remaining })}</p>
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
                                                    <div className="w-32 shrink-0 text-right">
                                                        <Pill tone={qty === remaining ? 'emerald' : qty > 0 ? 'amber' : 'neutral'}>
                                                            {qty === remaining ? t('pickup.full') : qty > 0 ? t('pickup.partial') : t('pickup.noneSelected')}
                                                        </Pill>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        </section>
                    )}

                    <section className={cx(cardPadded, 'space-y-4')}>
                        <h2 className={sectionTitle}>{t('pickup.recipient')}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setRecipientType('client')}
                                className={cx(
                                    'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition',
                                    recipientType === 'client'
                                        ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-300'
                                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                )}
                            >
                                <UserRound aria-hidden="true" className="h-4 w-4" />
                                {t('pickup.recipientClient')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecipientType('tiers')}
                                className={cx(
                                    'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition',
                                    recipientType === 'tiers'
                                        ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-300'
                                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                )}
                            >
                                <Users aria-hidden="true" className="h-4 w-4" />
                                {t('pickup.recipientThirdParty')}
                            </button>
                        </div>
                        <label className="block">
                            <span className={label}>{t('pickup.recipientName')}</span>
                            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={cx(input, 'w-full')} />
                        </label>
                    </section>

                    <section className={cx(cardPadded, 'space-y-4')}>
                        <h2 className={sectionTitle}>{t('pickup.conditionTitle')}</h2>
                        <div className="space-y-2">
                            <span className={label}>{t('pickup.condition')}</span>
                            <div className="flex flex-wrap gap-2">
                                {CONDITIONS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setCondition(c)}
                                        className={cx(
                                            'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition',
                                            condition === c
                                                ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                                                : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700',
                                        )}
                                    >
                                        {t(`pickup.conditionStatus.${c}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="block">
                            <span className={label}>{t('pickup.conditionNotes')}</span>
                            <textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                        </label>
                    </section>
                </div>

                <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                    <section className={cx(cardPadded, 'space-y-4')}>
                        <h2 className={sectionTitle}>{t('pickup.balance')}</h2>
                        <p className="text-sm text-ink-600 dark:text-ink-350">
                            {t('pickup.totalAmount', { amount: money(order.total_amount) })}
                        </p>
                        {balanceDue > 0 ? (
                            <Alert tone="error">{t('pickup.balanceDueWarning', { amount: money(balanceDue) })}</Alert>
                        ) : (
                            <Alert tone="success">{t('pickup.balancePaid')}</Alert>
                        )}
                        {balanceDue > 0 && (
                            <>
                                <PaymentMethodPicker name="pickup-payment-method" value={paymentMethod} onChange={setPaymentMethod} layout="compact" />
                                <label className="block">
                                    <span className={label}>{t('pickup.collectAmount')}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={balanceDue}
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        className={cx(input, 'w-full')}
                                    />
                                </label>
                                {referenceRequired && (
                                    <PaymentReferenceField method={paymentMethod} value={paymentReference} onChange={setPaymentReference} />
                                )}
                                {needsOverride && (
                                    <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-400/30 dark:bg-red-400/5">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
                                            <input type="checkbox" checked={overrideUnpaid} onChange={(e) => setOverrideUnpaid(e.target.checked)} className="h-4 w-4 rounded" />
                                            {t('pickup.override', { amount: money(remainingAfterPayment) })}
                                        </label>
                                        {overrideUnpaid && (
                                            <label className="block">
                                                <span className={label}>{t('pickup.overrideReason')}</span>
                                                <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                                            </label>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <h2 className={sectionTitle}>{t('pickup.afterConfirm.title')}</h2>
                        <label className="flex items-start gap-2.5 text-sm text-ink-700 dark:text-ink-200">
                            <input
                                type="checkbox"
                                checked={printReceiptAfter}
                                onChange={(e) => setPrintReceiptAfter(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded"
                            />
                            {t('pickup.afterConfirm.print')}
                        </label>
                        <p className="flex items-start gap-2.5 text-sm text-ink-600 dark:text-ink-350">
                            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                            {t('pickup.afterConfirm.notifyInfo')}
                        </p>
                    </section>

                    {order.sync_status !== 'synced' && (
                        <section className={cx(cardPadded, 'space-y-2')}>
                            <h2 className={cx(sectionTitle, 'flex items-center gap-2')}>
                                <WifiOff aria-hidden="true" className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                                {t('pickup.sync.title')}
                            </h2>
                            <Alert tone={order.sync_status === 'conflict' ? 'error' : 'warning'}>
                                {order.sync_status === 'pending'
                                    ? t('documents.offline.pending', { uuid: order.client_local_uuid ?? '—' })
                                    : t('documents.offline.conflict')}
                            </Alert>
                        </section>
                    )}

                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={!canSubmit}
                        className={cx(button('accent', 'md'), 'w-full justify-center')}
                    >
                        {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        {t('pickup.confirm')}
                    </button>
                    <Link to="/pickups" className={cx(button('ghost', 'md'), 'w-full justify-center')}>
                        {t('common.cancel')}
                    </Link>
                </div>
            </div>

            <section aria-labelledby="pickup-audit-heading" className={cx(cardPadded, 'space-y-4')}>
                <h2 id="pickup-audit-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <ScrollText aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('order.audit.title')}
                </h2>
                <Timeline entries={auditTimeline} emptyLabel={t('order.audit.empty')} />
            </section>

            {printing && <PrintableTicket order={order} />}
        </div>
    );
}
