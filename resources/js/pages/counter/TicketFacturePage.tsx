import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileQuestion, FileText, Mail, Printer, Receipt, ReceiptText, WifiOff } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useSyncQueue } from '../../lib/useSyncQueue';
import PrintableTicket from '../../components/PrintableTicket';
import TicketReceiptContent from '../../components/TicketReceiptContent';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { useSettings } from '../../contexts/SettingsContext';
import { useFormat } from '../../lib/format';
import { button, card, cx, input, label, textLink } from '../../components/ui/styles';
import type { Order, OrderItem } from '../../types';

type DocumentFormat = 'ticket' | 'invoice';

/* Écran « Ticket et facture » (Figma SPARK PRESSING, section 05) : prévisualisation,
 * impression et envoi des documents d'un dépôt. Le ticket (jamais fiscalement figé) est
 * généré à la volée (GET /orders/:id/ticket-pdf) ; la facture réutilise le PDF déjà
 * stocké par InvoiceService à sa création. Seul le canal e-mail est réellement
 * livrable ici (pas de passerelle WhatsApp/SMS avec pièce jointe réelle) — omis plutôt
 * que simulé pour ne pas laisser croire à un envoi qui n'arriverait jamais. */

export default function TicketFacturePage() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [format, setFormat] = useState<DocumentFormat>('ticket');
    const [copies, setCopies] = useState(1);
    const [invoicePdfUrl, setInvoicePdfUrl] = useState<string | null>(null);
    const [printTicket, setPrintTicket] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
    const invoicePdfUrlRef = useRef<string | null>(null);
    const pendingQueue = useSyncQueue();

    useEffect(() => {
        if (!id) return;
        api
            .get<Order>(`/orders/${id}`)
            .then(setOrder)
            .finally(() => setLoading(false));
    }, [id]);

    const invoice = order?.invoice?.[0] ?? null;

    useEffect(() => {
        if (!invoice) return;
        let cancelled = false;
        api.blob(`/invoices/${invoice.id}/pdf`).then((blob) => {
            if (cancelled) return;
            const url = URL.createObjectURL(blob);
            invoicePdfUrlRef.current = url;
            setInvoicePdfUrl(url);
        });
        return () => {
            cancelled = true;
            if (invoicePdfUrlRef.current) {
                URL.revokeObjectURL(invoicePdfUrlRef.current);
                invoicePdfUrlRef.current = null;
            }
        };
    }, [invoice?.id]);

    useEffect(() => {
        if (printTicket) {
            const timeout = setTimeout(() => {
                window.print();
                setPrintTicket(false);
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [printTicket]);

    async function downloadActive() {
        if (!order) return;
        if (format === 'ticket') {
            const blob = await api.blob(`/orders/${order.id}/ticket-pdf`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ticket-${order.order_number}.pdf`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } else if (invoice) {
            const blob = await api.blob(`/invoices/${invoice.id}/pdf`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `facture-${invoice.invoice_number}.pdf`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
    }

    function printActive() {
        if (format === 'ticket') {
            setPrintTicket(true);
        } else if (invoicePdfUrl) {
            window.open(invoicePdfUrl, '_blank');
        }
    }

    async function sendActive() {
        if (!order) return;
        setSending(true);
        setSendResult(null);
        try {
            await api.post(`/orders/${order.id}/documents/${format}/send`);
            setSendResult({ tone: 'success', message: t('documents.sendSuccess', { email: order.client?.email ?? '' }) });
        } catch (err) {
            setSendResult({ tone: 'error', message: err instanceof ApiError ? err.message : t('documents.sendError') });
        } finally {
            setSending(false);
        }
    }

    const backLink = (
        <Link to={`/orders/${id}`} className={cx(textLink, 'no-print inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('documents.backToOrder')}
        </Link>
    );

    if (loading) return <LoadingState />;

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

    const hasEmail = Boolean(order.client?.email);
    const canSend = format === 'ticket' || invoice !== null;

    return (
        <div className="space-y-6">
            {backLink}

            <PageHeader
                title={t('documents.title')}
                subtitle={`${t('order.number')}${order.order_number_formatted ?? order.order_number} — ${order.client?.first_name} ${order.client?.last_name}`}
                icon={Receipt}
                actions={
                    <div className="no-print flex flex-wrap gap-2">
                        <button type="button" onClick={() => void downloadActive()} disabled={format === 'invoice' && !invoice} className={button('secondary')}>
                            <Download aria-hidden="true" className="h-4 w-4" />
                            {t('documents.download')}
                        </button>
                        <button type="button" onClick={printActive} disabled={format === 'invoice' && !invoice} className={button('accent')}>
                            <Printer aria-hidden="true" className="h-4 w-4" />
                            {t('documents.print')}
                        </button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1fr_320px] no-print">
                <section className={cx(card, 'space-y-3 p-5')}>
                    <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('documents.ticketPreview')}</h2>
                    <div className="rounded-xl bg-ink-100 p-4 dark:bg-ink-950/60">
                        <div className="mx-auto max-w-[300px] border-y-4 border-dashed border-ink-200 bg-white text-black shadow-md dark:border-ink-700">
                            <TicketReceiptContent order={order} />
                        </div>
                    </div>
                </section>

                <section className={cx(card, 'space-y-3 p-5')}>
                    <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('documents.invoicePreview')}</h2>
                    {invoice ? (
                        <div className="space-y-2">
                            <InvoiceSheet order={order} />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-ink-500 dark:text-ink-400">{t('documents.invoiceSheet.hint')}</p>
                                <button
                                    type="button"
                                    onClick={() => invoicePdfUrl && window.open(invoicePdfUrl, '_blank')}
                                    disabled={!invoicePdfUrl}
                                    className={cx(textLink, 'text-xs')}
                                >
                                    {t('documents.invoiceSheet.openPdf')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <EmptyState icon={Receipt} title={t('documents.invoiceMissingTitle')} description={t('documents.invoiceMissingHint')} />
                    )}
                </section>

                <div className="space-y-4 lg:sticky lg:top-6">
                    <section className={cx(card, 'space-y-4 p-5')}>
                        <div>
                            <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('documents.format')}</h2>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('documents.format.hint')}</p>
                        </div>
                        <div role="radiogroup" aria-label={t('documents.format')} className="space-y-2">
                            {(['ticket', 'invoice'] as const).map((value) => {
                                const unavailable = value === 'invoice' && !invoice;
                                const active = format === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setFormat(value)}
                                        className={cx(
                                            'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                                            active
                                                ? 'border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/40'
                                                : 'border-ink-200 hover:border-ink-300 dark:border-ink-700',
                                        )}
                                    >
                                        {value === 'ticket' ? (
                                            <ReceiptText aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300" />
                                        ) : (
                                            <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700 dark:text-brand-300" />
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-ink-900 dark:text-white">{t(`documents.formatRows.${value}`)}</span>
                                            <span className="block text-xs text-ink-500 dark:text-ink-400">
                                                {unavailable ? t('documents.formatRows.unavailable') : t(`documents.formatRows.${value}Hint`)}
                                            </span>
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className={cx(
                                                'h-4 w-4 shrink-0 rounded-full border-2',
                                                active ? 'border-brand-600 bg-brand-600 shadow-[inset_0_0_0_2px_white] dark:border-brand-400 dark:bg-brand-400' : 'border-ink-300 dark:border-ink-600',
                                            )}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                        {format === 'ticket' ? (
                            <label className="block">
                                <span className={label}>{t('documents.copies')}</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    value={copies}
                                    onChange={(e) => setCopies(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                                    className={cx(input, 'w-24')}
                                />
                            </label>
                        ) : (
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('documents.format.invoiceHint')}</p>
                        )}
                    </section>

                    <section className={cx(card, 'space-y-3 p-5')}>
                        <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('documents.actions')}</h2>
                        {hasEmail ? (
                            <button
                                type="button"
                                onClick={() => void sendActive()}
                                disabled={sending || !canSend}
                                className={cx(button('secondary', 'md'), 'w-full')}
                            >
                                {sending ? <Spinner className="h-4 w-4" /> : <Mail aria-hidden="true" className="h-4 w-4" />}
                                {t('documents.send')}
                            </button>
                        ) : (
                            <Alert tone="warning">{t('documents.noEmail')}</Alert>
                        )}
                        {sendResult && <Alert tone={sendResult.tone}>{sendResult.message}</Alert>}
                        {hasEmail && (
                            <div className="rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs dark:border-ink-800 dark:bg-ink-950/40">
                                <p className="font-semibold text-ink-700 dark:text-ink-200">{t('documents.sendTo')}</p>
                                <p className="text-ink-600 dark:text-ink-350">
                                    {order.client?.first_name} {order.client?.last_name} — {order.client?.email}
                                </p>
                            </div>
                        )}
                    </section>

                    {order.sync_status !== 'synced' && (
                        <section className={cx(card, 'space-y-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700/60 dark:bg-amber-950/20')}>
                            <h2 className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-200">
                                <WifiOff aria-hidden="true" className="h-4 w-4" />
                                {t('documents.offline.title')}
                            </h2>
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                {order.sync_status === 'pending'
                                    ? t('documents.offline.pending', { uuid: order.client_local_uuid ?? '—' })
                                    : t('documents.offline.conflict')}
                            </p>
                            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                                {t('documents.offline.localQueue', { count: pendingQueue.length })}
                            </p>
                        </section>
                    )}
                </div>
            </div>

            {printTicket && <PrintableTicket order={order} copies={copies} />}
        </div>
    );
}

/** Aperçu HTML de la facture (A4) construit à partir des montants réels de la facture
 * émise — lisible dans une colonne étroite, contrairement au visualiseur PDF natif. Le PDF
 * archivé reste accessible et fait foi. */
function InvoiceSheet({ order }: { order: Order }) {
    const { t } = useI18n();
    const { settings } = useSettings();
    const { money, date } = useFormat();
    const invoice = order.invoice![0];
    const paid = (invoice.payments ?? []).filter((p) => p.status === 'complete').reduce((sum, p) => sum + p.amount, 0);
    const lineTotal = (item: OrderItem) => item.unit_price * item.quantity;

    return (
        <div className="rounded-xl bg-ink-100 p-3 dark:bg-ink-950/60">
            <div className="space-y-4 bg-white p-5 text-[12px] text-ink-900 shadow-md">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-display text-sm font-bold">{settings?.pressing_name}</p>
                        {order.agency && <p className="text-ink-600">{order.agency.name}</p>}
                        {order.agency?.address && <p className="text-ink-600">{order.agency.address}</p>}
                    </div>
                    <div className="text-right">
                        <p className="font-display text-base font-extrabold uppercase text-brand-700">{t('documents.invoiceSheet.title')}</p>
                        <p className="font-semibold">{t('documents.invoiceSheet.number', { number: invoice.invoice_number })}</p>
                        {invoice.issued_at && <p className="text-ink-600">{t('documents.invoiceSheet.issuedAt', { date: date(invoice.issued_at) })}</p>}
                    </div>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">{t('documents.invoiceSheet.billedTo')}</p>
                    <p className="font-semibold">
                        {order.client?.first_name} {order.client?.last_name}
                    </p>
                    <p className="text-ink-600">{order.client?.phone}</p>
                    <p className="text-ink-600">{t('documents.invoiceSheet.deposit', { code: String(order.order_number_formatted ?? order.order_number) })}</p>
                </div>
                <table className="w-full">
                    <thead className="border-b border-ink-200 text-[10px] uppercase tracking-wider text-ink-500">
                        <tr>
                            <th className="py-1.5 text-left">{t('order.itemsTable.article')}</th>
                            <th className="py-1.5 text-right">{t('order.itemsTable.quantity')}</th>
                            <th className="py-1.5 text-right">{t('documents.invoiceSheet.amount')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                        {order.items.map((item) => (
                            <tr key={item.id}>
                                <td className="py-1.5 pr-2">
                                    {item.service?.name}
                                    {item.treatment_type && <span className="text-ink-500"> · {item.treatment_type.name}</span>}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">{item.weight_kg ? `${item.weight_kg} kg` : item.quantity}</td>
                                <td className="py-1.5 text-right tabular-nums">{money(lineTotal(item))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <dl className="ml-auto max-w-[220px] space-y-1">
                    <div className="flex justify-between">
                        <dt className="text-ink-600">{t('invoice.subtotal')}</dt>
                        <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
                    </div>
                    {invoice.discount_amount > 0 && (
                        <div className="flex justify-between">
                            <dt className="text-ink-600">{t('invoice.discount')}</dt>
                            <dd className="tabular-nums">-{money(invoice.discount_amount)}</dd>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <dt className="text-ink-600">{t('invoice.tax')}</dt>
                        <dd className="tabular-nums">{money(invoice.tax_amount)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-ink-200 pt-1 text-sm font-bold">
                        <dt>{t('ticket.totalTtc')}</dt>
                        <dd className="tabular-nums">{money(invoice.total_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-ink-600">{t('order.table.paid')}</dt>
                        <dd className="tabular-nums">{money(paid)}</dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                        <dt>{t('order.table.remaining')}</dt>
                        <dd className="tabular-nums">{money(Math.max(0, invoice.total_amount - paid))}</dd>
                    </div>
                </dl>
                {settings?.legal_notice && <p className="border-t border-ink-200 pt-2 text-[10px] text-ink-500">{settings.legal_notice}</p>}
            </div>
        </div>
    );
}
