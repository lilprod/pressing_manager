import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CalendarDays, ClipboardCheck, Clock, FileQuestion, Phone, Printer, ScrollText, StickyNote, Workflow, Zap } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { auditLogLabel } from '../../lib/auditLog';
import OrderItemRow from '../../components/OrderItemRow';
import PrintableTicket from '../../components/PrintableTicket';
import PrintableLabel from '../../components/PrintableLabel';
import InvoicePanel from '../../components/InvoicePanel';
import { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill, statusTone } from '../../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cardPadded, cx, sectionTitle, textLink } from '../../components/ui/styles';
import type { AuditLog, Order, OrderItem } from '../../types';

type PrintTarget = { kind: 'ticket' } | { kind: 'label'; item: OrderItem; dataUri: string } | null;

export default function OrderDetail() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

    useEffect(() => {
        if (!id) return;
        api
            .get<Order>(`/orders/${id}`)
            .then(setOrder)
            .finally(() => setLoading(false));
        api
            .get<AuditLog[]>(`/orders/${id}/audit-logs`)
            .then(setAuditLogs)
            .catch(() => setAuditLogs([]));
    }, [id]);

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
        entries.push({
            id: 'order-created',
            label: t('order.timeline.created'),
            at: order.created_at,
            actor: order.creator?.name ?? null,
        });
        return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [order, t]);

    const auditTimeline = useMemo<TimelineEntry[]>(
        () =>
            auditLogs.map((log) => ({
                id: log.id,
                label: auditLogLabel(log, t, money),
                at: log.created_at,
                actor: log.user?.name ?? t('order.audit.systemActor'),
            })),
        [auditLogs, t, money],
    );

    useEffect(() => {
        if (printTarget) {
            const timeout = setTimeout(() => window.print(), 100);
            return () => clearTimeout(timeout);
        }
    }, [printTarget]);

    function handleItemUpdated(updated: OrderItem) {
        // La réponse PATCH ne recharge pas toujours la relation `service` : on conserve celle déjà affichée.
        setOrder((current) =>
            current
                ? { ...current, items: current.items.map((i) => (i.id === updated.id ? { ...updated, service: updated.service ?? i.service } : i)) }
                : current,
        );
    }

    async function printLabel(item: OrderItem) {
        const { data_uri } = await api.get<{ qr_code: string; data_uri: string }>(`/order-items/${item.id}/qr-code`);
        setPrintTarget({ kind: 'label', item, dataUri: data_uri });
    }

    const backLink = (
        <Link to="/orders" className={cx(textLink, 'no-print inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('order.backToOrders')}
        </Link>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (!order) {
        return (
            <div className="space-y-4">
                {backLink}
                <div role="alert" className={card}>
                    <EmptyState icon={FileQuestion} title={t('common.error')} />
                </div>
            </div>
        );
    }

    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="space-y-6">
            {backLink}

            <header className={cx(cardPadded, 'relative overflow-hidden')}>
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-100/60 blur-2xl dark:bg-brand-400/10"
                />
                <div className="relative flex flex-wrap items-start justify-between gap-5">
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="font-display text-2xl font-extrabold text-ink-900 sm:text-3xl dark:text-white">
                                {t('order.number')}
                                {order.order_number}
                            </h1>
                            <StatusBadge kind="order" status={order.status} size="md" />
                            {order.is_express && (
                                <Pill tone="accent" icon={Zap}>
                                    {t('order.expressShort')}
                                </Pill>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600 dark:text-ink-350">
                            <span className="inline-flex items-center gap-2">
                                <Avatar firstName={order.client?.first_name} lastName={order.client?.last_name} size="sm" />
                                <span className="font-semibold text-ink-900 dark:text-ink-50">
                                    {order.client?.first_name} {order.client?.last_name}
                                </span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Phone aria-hidden="true" className="h-4 w-4" />
                                {order.client?.phone}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                                {dateTime(order.created_at)}
                            </span>
                            {order.promised_at && (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300">
                                    <Clock aria-hidden="true" className="h-4 w-4" />
                                    {t('order.promisedAt')} {dateTime(order.promised_at)}
                                </span>
                            )}
                        </div>
                        {order.notes && (
                            <p className="inline-flex items-start gap-1.5 text-sm text-ink-700 dark:text-ink-300">
                                <StickyNote aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                {order.notes}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col items-start gap-3 sm:items-end">
                        <div className="sm:text-right">
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">{t('common.total')}</p>
                            <p className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</p>
                        </div>
                        <button type="button" onClick={() => setPrintTarget({ kind: 'ticket' })} className={cx(button('secondary'), 'no-print')}>
                            <Printer aria-hidden="true" className="h-4 w-4" />
                            {t('common.print')} — {t('order.ticket')}
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                    label={t('order.commercialStatus.title')}
                    value={order.invoice && order.invoice.length > 0 ? t(`invoice.status.${order.invoice[0].status}`) : t('order.commercialStatus.notInvoiced')}
                    icon={ClipboardCheck}
                    tone={order.invoice && order.invoice.length > 0 ? statusTone('invoice', order.invoice[0].status) : 'neutral'}
                />
                <StatCard label={t('order.workshopStatus.title')} value={t(`status.${order.status}`)} icon={Workflow} tone={statusTone('order', order.status)} />
                <StatCard
                    label={t('order.balanceDue.title')}
                    value={order.invoice && order.invoice.length > 0 ? (order.balance_due ? money(order.balance_due) : t('order.balanceDue.settled')) : '—'}
                    icon={Banknote}
                    tone={order.balance_due ? 'rose' : 'emerald'}
                />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                <section aria-labelledby="items-heading" className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h2 id="items-heading" className={sectionTitle}>
                            {t('order.items')}
                        </h2>
                        <Pill tone="neutral">{t('order.itemsCount', { count: itemCount })}</Pill>
                    </div>
                    <ul className="space-y-3">
                        {order.items.map((item) => (
                            <OrderItemRow key={item.id} item={item} onUpdated={handleItemUpdated} onPrintLabel={printLabel} />
                        ))}
                    </ul>
                </section>

                <div className="lg:sticky lg:top-20">
                    <InvoicePanel order={order} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <section aria-labelledby="timeline-heading" className={cx(cardPadded, 'space-y-4')}>
                    <h2 id="timeline-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                        <Workflow aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                        {t('order.timeline.title')}
                    </h2>
                    <Timeline entries={workshopTimeline} emptyLabel={t('order.timeline.empty')} />
                </section>

                <section aria-labelledby="audit-heading" className={cx(cardPadded, 'space-y-4')}>
                    <h2 id="audit-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                        <ScrollText aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                        {t('order.audit.title')}
                    </h2>
                    <Timeline entries={auditTimeline} emptyLabel={t('order.audit.empty')} />
                </section>
            </div>

            {printTarget?.kind === 'ticket' && <PrintableTicket order={order} />}
            {printTarget?.kind === 'label' && <PrintableLabel item={printTarget.item} dataUri={printTarget.dataUri} />}
        </div>
    );
}
