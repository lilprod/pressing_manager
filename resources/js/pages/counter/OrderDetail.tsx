import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Ban,
    Banknote,
    ClipboardCheck,
    CloudCheck,
    Plus,
    PackageCheck,
    FileQuestion,
    Pencil,
    Printer,
    Workflow,
    X,
    Zap,
} from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { auditLogLabel } from '../../lib/auditLog';
import OrderItemRow from '../../components/OrderItemRow';
import PrintableTicket from '../../components/PrintableTicket';
import PrintableLabel from '../../components/PrintableLabel';
import InvoicePanel from '../../components/InvoicePanel';
import { itemPrestationLabel } from '../../lib/orderItem';
import { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill, statusTone } from '../../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cardPadded, cx, input, label as labelClass, sectionTitle, textLink } from '../../components/ui/styles';
import type { AuditLog, Order, OrderItem } from '../../types';

type PrintTarget = { kind: 'ticket' } | { kind: 'label'; item: OrderItem; dataUri: string } | null;

/** Même utilitaire que RhPage.tsx (pas d'extraction pour 2 lignes) : valeur locale
 * pour un <input type="datetime-local"> à partir d'un ISO serveur (UTC). */
function toLocalDatetimeInputValue(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const NOT_EDITABLE_STATUSES = ['livre', 'annule'];

export default function OrderDetail() {
    const { id } = useParams<{ id: string }>();
    const { t, lang } = useI18n();
    const { money, dateTime } = useFormat();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [itemsView, setItemsView] = useState<'summary' | 'tracking'>('summary');
    const [showFullTimeline, setShowFullTimeline] = useState(false);
    const [showFullAudit, setShowFullAudit] = useState(false);
    const [paymentSignal, setPaymentSignal] = useState(0);

    const [editing, setEditing] = useState(false);
    const [editNotes, setEditNotes] = useState('');
    const [editPromisedAt, setEditPromisedAt] = useState('');
    const [editExpress, setEditExpress] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [cancelling, setCancelling] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelBusy, setCancelBusy] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

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

    function openEdit() {
        if (!order) return;
        setEditNotes(order.notes ?? '');
        setEditPromisedAt(order.promised_at ? toLocalDatetimeInputValue(order.promised_at) : '');
        setEditExpress(order.is_express);
        setEditError(null);
        setEditing(true);
    }

    async function saveEdit() {
        if (!order) return;
        setSavingEdit(true);
        setEditError(null);
        try {
            const updated = await api.patch<Order>(`/orders/${order.id}`, {
                notes: editNotes.trim() || null,
                promised_at: editPromisedAt ? new Date(editPromisedAt).toISOString() : null,
                is_express: editExpress,
            });
            setOrder(updated);
            setEditing(false);
        } catch (err) {
            setEditError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setSavingEdit(false);
        }
    }

    async function confirmCancel() {
        if (!order) return;
        setCancelBusy(true);
        setCancelError(null);
        try {
            const updated = await api.post<Order>(`/orders/${order.id}/cancel`, {
                reason: cancelReason.trim() || undefined,
            });
            setOrder(updated);
            setCancelling(false);
            setCancelReason('');
        } catch (err) {
            setCancelError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setCancelBusy(false);
        }
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
    const treatmentNames = [...new Set(order.items.map((i) => i.treatment_type?.name).filter((n): n is string => !!n))];
    const finishNames = [...new Set(order.items.map((i) => i.finish_option?.name).filter((n): n is string => !!n))];
    const invoice = order.invoice?.[0] ?? null;
    const invoiceStatus = invoice?.status;
    const canAddPayment = order.status !== 'annule' && invoiceStatus !== 'payee' && invoiceStatus !== 'annulee';
    const editable = !NOT_EDITABLE_STATUSES.includes(order.status);
    const activeStatus = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret'].includes(order.status);
    const paidAmount = (invoice?.payments ?? []).filter((p) => p.status === 'complete').reduce((sum, p) => sum + p.amount, 0);
    const commercialLabel = invoice ? t(`invoice.status.${invoice.status}`) : t('order.commercialStatus.notInvoiced');
    const itemsSubtotal = order.items.reduce((sum, item) => sum + lineTotal(item), 0);
    const hasWeight = order.items.some((i) => i.weight_kg);
    const hasPieces = order.items.some((i) => !i.weight_kg);
    const billingKind = hasWeight && hasPieces ? 'mixed' : hasWeight ? 'kg' : 'piece';
    const flaggedCount = order.items.filter((i) => (i.intake_conditions?.length ?? 0) > 0 || i.intake_notes).length;
    const turnaroundHours = order.promised_at
        ? Math.max(0, Math.round((new Date(order.promised_at).getTime() - new Date(order.created_at).getTime()) / 3_600_000))
        : null;
    // Dernière transition réelle d'un article (chronologie atelier, hors création du dépôt).
    const lastStep = workshopTimeline.find((entry) => entry.id !== 'order-created') ?? null;

    function focusPayment() {
        setPaymentSignal((n) => n + 1);
        window.setTimeout(() => {
            document.getElementById('invoice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.getElementById(`invoice-amount-${order!.id}`)?.focus({ preventScroll: true });
        }, 100);
    }

    function dayTime(value: string): string {
        const d = new Date(value);
        const today = new Date();
        const hm = hourMinute(value);
        if (d.toDateString() === today.toDateString()) return t('order.table.todayAt', { time: hm });
        return dateTime(value);
    }

    function hourMinute(value: string): string {
        return new Date(value).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    /** Heure seule pour aujourd'hui, sinon jour + heure (une liste mêlant plusieurs jours reste lisible). */
    function shortStamp(value: string): string {
        const d = new Date(value);
        if (d.toDateString() === new Date().toDateString()) return hourMinute(value);
        return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'short' }).format(d) + ' ' + hourMinute(value);
    }

    function monthYear(value: string): string {
        return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric' }).format(new Date(value));
    }

    return (
        <div className="space-y-6">
            {backLink}

            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-display text-2xl font-extrabold text-ink-900 sm:text-3xl dark:text-white">
                            {t('order.detail.title', { code: String(order.order_number_formatted ?? order.order_number) })}
                        </h1>
                        <Pill tone={invoice ? statusTone('invoice', invoice.status) : 'neutral'}>{commercialLabel}</Pill>
                        <StatusBadge kind="order" status={order.status} size="md" />
                    </div>
                    <p className="text-sm text-ink-600 dark:text-ink-350">
                        {[
                            t('order.detail.createdAt', { when: dayTime(order.created_at) }),
                            order.agency ? t('order.detail.agency', { name: order.agency.name }) : null,
                            order.creator ? t('order.detail.by', { name: order.creator.name }) : null,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                </div>
                <div className="no-print flex flex-wrap gap-2">
                    <button type="button" onClick={() => setPrintTarget({ kind: 'ticket' })} className={button('secondary')}>
                        <Printer aria-hidden="true" className="h-4 w-4" />
                        {t('common.print')}
                    </button>
                    {editable && (
                        <button type="button" onClick={openEdit} className={button('secondary')}>
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                            {t('common.edit')}
                        </button>
                    )}
                    {canAddPayment && (
                        <button type="button" onClick={focusPayment} className={button('primary')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('order.addDeposit')}
                        </button>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t('order.commercialStatus.title')}
                    value={invoice ? t(`order.commercialShort.${invoice.status}`) : t('order.commercialStatus.notInvoiced')}
                    icon={ClipboardCheck}
                    tone={invoice ? statusTone('invoice', invoice.status) : 'neutral'}
                    hint={order.promised_at ? t('order.detail.pickupDue', { when: dayTime(order.promised_at) }) : undefined}
                />
                <StatCard
                    label={t('order.workshopStatus.title')}
                    value={t(`status.${order.status}`)}
                    icon={Workflow}
                    tone={statusTone('order', order.status)}
                    hint={lastStep ? t('order.detail.lastStep', { when: dayTime(lastStep.at) }) : undefined}
                />
                <StatCard
                    label={t('order.detail.syncTitle')}
                    value={t('order.sync.upToDate')}
                    icon={CloudCheck}
                    tone="emerald"
                    hint={
                        order.source === 'offline_sync'
                            ? t('order.detail.syncOffline', { when: dayTime(order.created_at) })
                            : t('order.detail.syncOnline')
                    }
                />
                <StatCard
                    label={t('order.balanceDue.title')}
                    value={invoice ? (order.balance_due ? money(order.balance_due) : t('order.balanceDue.settled')) : '—'}
                    icon={Banknote}
                    tone={order.balance_due ? 'rose' : 'emerald'}
                    hint={invoice ? (paidAmount > 0 ? t('order.detail.depositOf', { amount: money(paidAmount) }) : t('order.detail.noDeposit')) : t('order.commercialStatus.notInvoiced')}
                />
            </div>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-6">
                    <section aria-labelledby="items-heading" className={cx(card, 'overflow-hidden')}>
                        <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
                            <div>
                                <h2 id="items-heading" className={sectionTitle}>
                                    {t('order.detail.itemsTitle')}
                                </h2>
                                <p className="text-xs text-ink-600 dark:text-ink-350">
                                    {t('order.itemsCount', { count: itemCount })} · {t(`order.detail.billing.${billingKind}`)}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                                <button type="button" onClick={() => setItemsView((v) => (v === 'summary' ? 'tracking' : 'summary'))} className={textLink}>
                                    {itemsView === 'summary' ? t('order.itemsView.tracking') : t('order.itemsView.summary')}
                                </button>
                                <Link to={`/orders/${order.id}/documents`} className={textLink}>
                                    {t('order.detail.viewTicket')}
                                </Link>
                            </div>
                        </div>

                        {itemsView === 'summary' ? (
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[560px] text-sm">
                                    <thead className="bg-ink-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:bg-ink-950/40 dark:text-ink-400">
                                        <tr>
                                            <th scope="col" className="px-5 py-2.5">{t('order.detail.articleState')}</th>
                                            <th scope="col" className="px-3 py-2.5 text-right">{t('order.detail.qty')}</th>
                                            <th scope="col" className="px-3 py-2.5 text-right">{t('order.detail.unitPrice')}</th>
                                            <th scope="col" className="px-5 py-2.5 text-right">{t('common.total')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {order.items.map((item) => {
                                            const detail = [
                                                itemPrestationLabel(item),
                                                item.description,
                                                ...(item.intake_conditions ?? []).map((c) => c.label),
                                                item.intake_notes,
                                            ].filter(Boolean);
                                            return (
                                                <tr key={item.id}>
                                                    <td className="px-5 py-3">
                                                        <p className="font-medium text-ink-900 dark:text-white">{item.service?.name ?? t('order.item')}</p>
                                                        {detail.length > 0 && <p className="text-xs text-ink-500 dark:text-ink-400">{detail.join(' · ')}</p>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">
                                                        {item.weight_kg ? `${item.weight_kg} kg` : item.quantity}
                                                    </td>
                                                    <td className="px-3 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">
                                                        {item.weight_kg ? '—' : money(item.unit_price)}
                                                    </td>
                                                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink-900 dark:text-white">{money(lineTotal(item))}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="border-t border-ink-200/80 dark:border-ink-800">
                                        <tr>
                                            <td colSpan={3} className="px-5 py-3 text-ink-600 dark:text-ink-350">
                                                {t('order.detail.itemsSubtotal')}
                                            </td>
                                            <td className="px-5 py-3 text-right font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(itemsSubtotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (
                            <ul className="space-y-3 p-5">
                                {order.items.map((item) => (
                                    <OrderItemRow key={item.id} item={item} onUpdated={handleItemUpdated} onPrintLabel={printLabel} />
                                ))}
                            </ul>
                        )}
                    </section>

                    <section aria-labelledby="options-heading" className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 id="options-heading" className={sectionTitle}>
                                {t('order.options.title')}
                            </h2>
                            <p className="text-xs text-ink-600 dark:text-ink-350">{t('order.options.subtitle')}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Pill tone={order.is_express ? 'accent' : 'neutral'} icon={order.is_express ? Zap : undefined}>
                                {order.is_express ? t('order.expressShort') : t('order.standard')}
                                {turnaroundHours !== null ? ` · ${t('order.options.hours', { count: turnaroundHours })}` : ''}
                            </Pill>
                            {flaggedCount > 0 && <Pill tone="amber">{t('order.options.flagged', { count: flaggedCount })}</Pill>}
                            {finishNames.map((name) => (
                                <Pill key={name} tone="emerald">
                                    {t('order.options.finish', { name })}
                                </Pill>
                            ))}
                            {treatmentNames.map((name) => (
                                <Pill key={name} tone="neutral">
                                    {name}
                                </Pill>
                            ))}
                            <Pill tone="sky">{t('order.options.piecesCounted', { count: itemCount })}</Pill>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('order.options.collect')}</p>
                                <dl className="space-y-1.5 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-ink-600 dark:text-ink-350">{t('order.options.mode')}</dt>
                                        <dd className="font-medium text-ink-900 dark:text-ink-50">{t('order.options.pickupInAgency')}</dd>
                                    </div>
                                    {order.agency && (
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-ink-600 dark:text-ink-350">{t('order.options.agency')}</dt>
                                            <dd className="font-medium text-ink-900 dark:text-ink-50">{order.agency.name}</dd>
                                        </div>
                                    )}
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-ink-600 dark:text-ink-350">{t('order.promisedAt')}</dt>
                                        <dd className="font-medium text-ink-900 dark:text-ink-50">{order.promised_at ? dayTime(order.promised_at) : '—'}</dd>
                                    </div>
                                </dl>
                            </div>
                            <div className="rounded-xl bg-ink-50 p-3.5 dark:bg-ink-950/60">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('order.options.remarks')}</p>
                                <p className="text-sm text-ink-800 dark:text-ink-100">{order.notes || t('order.options.noRemarks')}</p>
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <section aria-labelledby="timeline-heading" className={cx(cardPadded, 'space-y-4')}>
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h2 id="timeline-heading" className={sectionTitle}>
                                        {t('order.timeline.title')}
                                    </h2>
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('order.timeline.subtitle')}</p>
                                </div>
                                {activeStatus && (
                                    <Link to={`/atelier?order=${order.id}`} className={cx(textLink, 'text-xs')}>
                                        {t('order.followWorkshop')}
                                    </Link>
                                )}
                            </div>
                            <Timeline entries={showFullTimeline ? workshopTimeline : workshopTimeline.slice(0, 5)} emptyLabel={t('order.timeline.empty')} />
                            {workshopTimeline.length > 5 && (
                                <button type="button" onClick={() => setShowFullTimeline((v) => !v)} className={cx(textLink, 'text-sm')}>
                                    {showFullTimeline ? t('order.journal.showLess') : t('order.journal.showAll', { count: workshopTimeline.length })}
                                </button>
                            )}
                        </section>

                        <section aria-labelledby="audit-heading" className={cx(cardPadded, 'space-y-3')}>
                            <div>
                                <h2 id="audit-heading" className={sectionTitle}>
                                    {t('order.audit.title')}
                                </h2>
                                <p className="text-xs text-ink-600 dark:text-ink-350">{t('order.audit.subtitle')}</p>
                            </div>
                            {auditTimeline.length === 0 ? (
                                <p className="text-sm text-ink-500">{t('order.audit.empty')}</p>
                            ) : (
                                <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                                    {(showFullAudit ? auditTimeline : auditTimeline.slice(0, 6)).map((entry) => (
                                        <li key={entry.id} className="grid grid-cols-[4.5rem_minmax(0,6rem)_minmax(0,1fr)] gap-3 py-2">
                                            <span className="tabular-nums text-ink-500 dark:text-ink-400">{shortStamp(entry.at)}</span>
                                            <span className="truncate font-semibold text-ink-800 dark:text-ink-100">{entry.actor}</span>
                                            <span className="text-ink-700 dark:text-ink-200">{entry.label}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {auditTimeline.length > 6 && (
                                <button type="button" onClick={() => setShowFullAudit((v) => !v)} className={cx(textLink, 'text-sm')}>
                                    {showFullAudit ? t('order.journal.showLess') : t('order.journal.showAll', { count: auditTimeline.length })}
                                </button>
                            )}
                        </section>
                    </div>
                </div>

                <div className="space-y-6 lg:sticky lg:top-20">
                    {order.client && (
                        <section aria-labelledby="client-card-heading" className={cx(cardPadded, 'space-y-4')}>
                            <div className="flex items-center justify-between gap-2">
                                <h2 id="client-card-heading" className={sectionTitle}>
                                    {t('order.client')}
                                </h2>
                                <Link to={`/clients/${order.client_id}`} className={cx(textLink, 'text-xs')}>
                                    {t('order.openClient')}
                                </Link>
                            </div>
                            <div className="flex items-center gap-3">
                                <Avatar firstName={order.client.first_name} lastName={order.client.last_name} size="md" />
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-ink-900 dark:text-ink-50">
                                        {order.client.first_name} {order.client.last_name}
                                    </p>
                                    <p className="truncate text-xs text-ink-600 dark:text-ink-350">
                                        {order.client.phone} · {t('order.clientSince', { date: monthYear(order.client.created_at) })}
                                    </p>
                                </div>
                            </div>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-ink-600 dark:text-ink-350">{t('order.detail.loyalty')}</dt>
                                    <dd className="font-medium text-ink-900 dark:text-ink-50">
                                        {t('order.detail.pointsAvailable', { count: order.client.loyalty_points })}
                                        {order.client.loyalty_tier_name ? ` · ${order.client.loyalty_tier_name}` : ''}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-ink-600 dark:text-ink-350">{t('order.detail.clientBalance')}</dt>
                                    <dd
                                        className={cx(
                                            'font-medium',
                                            order.client.other_balance_due ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300',
                                        )}
                                    >
                                        {order.client.other_balance_due ? money(order.client.other_balance_due) : t('order.clientBalance.none')}
                                    </dd>
                                </div>
                            </dl>
                        </section>
                    )}

                    <InvoicePanel order={order} openPaymentSignal={paymentSignal} />

                    <section aria-labelledby="actions-heading" className={cx(cardPadded, 'space-y-3 no-print')}>
                        <div>
                            <h2 id="actions-heading" className={sectionTitle}>
                                {t('order.actions.title')}
                            </h2>
                            <p className="text-xs text-ink-600 dark:text-ink-350">{t('order.actions.subtitle')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            <button type="button" onClick={() => setPrintTarget({ kind: 'ticket' })} className={button('secondary', 'md', 'w-full')}>
                                <Printer aria-hidden="true" className="h-4 w-4" />
                                {t('order.printTicket')}
                            </button>
                            {order.status === 'pret' && (
                                <Link to={`/pickups/${order.id}`} className={button('secondary', 'md', 'w-full')}>
                                    <PackageCheck aria-hidden="true" className="h-4 w-4" />
                                    {t('order.actions.pickup')}
                                </Link>
                            )}
                            {editable && (
                                <button type="button" onClick={openEdit} className={button('secondary', 'md', 'w-full')}>
                                    <Pencil aria-hidden="true" className="h-4 w-4" />
                                    {t('order.edit.action')}
                                </button>
                            )}
                            {activeStatus && (
                                <Link to={`/atelier?order=${order.id}`} className={button('secondary', 'md', 'w-full')}>
                                    <Workflow aria-hidden="true" className="h-4 w-4" />
                                    {t('order.followWorkshop')}
                                </Link>
                            )}
                            {editable && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCancelReason('');
                                        setCancelError(null);
                                        setCancelling(true);
                                    }}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                                >
                                    <Ban aria-hidden="true" className="h-4 w-4" />
                                    {t('order.cancel.action')}
                                </button>
                            )}
                        </div>
                        {editable && <p className="text-xs text-ink-500 dark:text-ink-400">{t('order.actions.note')}</p>}
                    </section>
                </div>
            </div>

            {printTarget?.kind === 'ticket' && <PrintableTicket order={order} />}
            {printTarget?.kind === 'label' && <PrintableLabel item={printTarget.item} dataUri={printTarget.dataUri} />}

            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                    <section className={cx(card, 'w-full max-w-md space-y-4 p-6')}>
                        <div className="flex items-center justify-between">
                            <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">{t('order.edit.title')}</h2>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                aria-label={t('common.close')}
                                className="text-ink-500 hover:text-ink-700 dark:text-ink-400"
                            >
                                <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </div>

                        {editError && <Alert tone="error">{editError}</Alert>}

                        <label className="block">
                            <span className={labelClass}>{t('order.edit.notes')}</span>
                            <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                rows={3}
                                className={cx(input, 'w-full')}
                            />
                        </label>

                        <label className="block">
                            <span className={labelClass}>{t('order.edit.promisedAt')}</span>
                            <input
                                type="datetime-local"
                                value={editPromisedAt}
                                onChange={(e) => setEditPromisedAt(e.target.value)}
                                className={cx(input, 'w-full')}
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
                            <input
                                type="checkbox"
                                checked={editExpress}
                                onChange={(e) => setEditExpress(e.target.checked)}
                                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 dark:border-ink-600"
                            />
                            {t('order.edit.express')}
                        </label>

                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setEditing(false)} className={button('secondary')}>
                                {t('common.cancel')}
                            </button>
                            <button type="button" onClick={saveEdit} disabled={savingEdit} className={button('primary')}>
                                {savingEdit && <Spinner />}
                                {t('common.save')}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {cancelling && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                    <section className={cx(card, 'w-full max-w-md space-y-4 p-6')}>
                        <div className="flex items-center justify-between">
                            <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">{t('order.cancel.title')}</h2>
                            <button
                                type="button"
                                onClick={() => setCancelling(false)}
                                aria-label={t('common.close')}
                                className="text-ink-500 hover:text-ink-700 dark:text-ink-400"
                            >
                                <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </div>

                        <Alert tone="warning">{t('order.cancel.warning')}</Alert>
                        {cancelError && <Alert tone="error">{cancelError}</Alert>}

                        <label className="block">
                            <span className={labelClass}>{t('order.cancel.reason')}</span>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                rows={3}
                                className={cx(input, 'w-full')}
                            />
                        </label>

                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setCancelling(false)} className={button('secondary')}>
                                {t('common.close')}
                            </button>
                            <button type="button" onClick={confirmCancel} disabled={cancelBusy} className={button('danger')}>
                                {cancelBusy && <Spinner />}
                                {t('order.cancel.confirm')}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

/** Montant d'une ligne tel que facturé : `unit_price` est figé à la création (une ligne au poids a une quantité de 1). */
function lineTotal(item: OrderItem): number {
    return item.unit_price * item.quantity;
}
