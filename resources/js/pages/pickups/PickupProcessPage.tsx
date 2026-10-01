import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, PackageCheck, UserRound, Users } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, label, sectionTitle, textLink } from '../../components/ui/styles';
import type { Order, PickupConditionStatus, PickupRecipientType } from '../../types';

const CONDITIONS: PickupConditionStatus[] = ['conforme', 'reserve', 'anomalie'];

export default function PickupProcessPage() {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [recipientType, setRecipientType] = useState<PickupRecipientType>('client');
    const [recipientName, setRecipientName] = useState('');
    const [condition, setCondition] = useState<PickupConditionStatus>('conforme');
    const [conditionNotes, setConditionNotes] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [overrideUnpaid, setOverrideUnpaid] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
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
    }, [orderId]);

    const eligibleItems = useMemo(
        () => (order?.items ?? []).filter((item) => ['pret', 'non_recupere'].includes(item.status) && item.quantity - item.quantity_delivered > 0),
        [order],
    );

    const balanceDue = useMemo(() => {
        if (!order?.invoice) return 0;
        return order.invoice.reduce((sum, invoice) => {
            const paid = (invoice.payments ?? []).filter((p) => p.status === 'complete').reduce((s, p) => s + p.amount, 0);
            return sum + Math.max(0, invoice.total_amount - paid);
        }, 0);
    }, [order]);

    const collected = Number(paymentAmount) || 0;
    const remainingAfterPayment = Math.max(0, balanceDue - collected);
    const needsOverride = remainingAfterPayment > 0;

    function setQuantity(itemId: number, value: number, max: number) {
        setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(max, value)) }));
    }

    const selectedCount = Object.values(quantities).filter((q) => q > 0).length;
    const canSubmit =
        !busy &&
        selectedCount > 0 &&
        recipientName.trim() !== '' &&
        (!needsOverride || (overrideUnpaid && overrideReason.trim() !== ''));

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
                override_unpaid: needsOverride ? overrideUnpaid : undefined,
                override_reason: needsOverride && overrideUnpaid ? overrideReason : undefined,
            });
            navigate('/pickups');
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

    return (
        <div className="max-w-3xl space-y-4">
            <Link to="/pickups" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('pickup.backToList')}
            </Link>

            <section className={cx(cardPadded, 'space-y-1')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">
                        {t('pickup.processTitle', { number: order.order_number })}
                    </h1>
                    <Pill tone="brand">{order.client?.first_name} {order.client?.last_name}</Pill>
                </div>
                <p className="text-sm text-ink-600 dark:text-ink-350">
                    {order.promised_at ? t('pickup.promisedAt', { date: dateTime(order.promised_at) }) : t('pickup.noPromisedDate')}
                </p>
            </section>

            {error && <Alert tone="error">{error}</Alert>}

            {eligibleItems.length === 0 ? (
                <EmptyState icon={PackageCheck} title={t('pickup.nothingToWithdraw')} />
            ) : (
                <section className={cx(card, 'overflow-hidden')}>
                    <h2 className={cx(sectionTitle, 'px-5 pt-5')}>{t('pickup.itemsVerification')}</h2>
                    <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
                        {eligibleItems.map((item) => {
                            const remaining = item.quantity - item.quantity_delivered;
                            const qty = quantities[item.id] ?? 0;
                            return (
                                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                        <p className="font-semibold text-ink-900 dark:text-ink-50">{item.service?.name ?? item.description}</p>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('pickup.remaining', { count: remaining })}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setQuantity(item.id, qty - 1, remaining)}
                                            className={button('secondary', 'sm', 'w-9 px-0')}
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
                                            className={cx(input, 'h-9 w-16 text-center')}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setQuantity(item.id, qty + 1, remaining)}
                                            className={button('secondary', 'sm', 'w-9 px-0')}
                                            aria-label={t('common.increase')}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <Pill tone={qty === remaining ? 'emerald' : qty > 0 ? 'amber' : 'neutral'}>
                                        {qty === remaining ? t('pickup.full') : qty > 0 ? t('pickup.partial') : t('pickup.noneSelected')}
                                    </Pill>
                                </li>
                            );
                        })}
                    </ul>
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

            <section className={cx(cardPadded, 'space-y-4')}>
                <h2 className={sectionTitle}>{t('pickup.balance')}</h2>
                {balanceDue > 0 ? (
                    <Alert tone="warning">{t('pickup.balanceDueWarning', { amount: money(balanceDue) })}</Alert>
                ) : (
                    <Alert tone="success">{t('pickup.balancePaid')}</Alert>
                )}
                {balanceDue > 0 && (
                    <>
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
                        {needsOverride && (
                            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-400/5">
                                <label className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
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

            <div className="flex justify-end gap-2 pb-6">
                <Link to="/pickups" className={button('ghost', 'md')}>
                    {t('common.cancel')}
                </Link>
                <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit} className={button('primary', 'md')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                    {t('pickup.confirm')}
                </button>
            </div>
        </div>
    );
}
