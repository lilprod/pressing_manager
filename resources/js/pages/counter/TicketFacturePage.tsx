import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileQuestion, Mail, Printer, Receipt, WifiOff } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import PrintableTicket from '../../components/PrintableTicket';
import TicketReceiptContent from '../../components/TicketReceiptContent';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { ChipToggle } from '../../components/ui/Metrics';
import { button, card, cx, input, label, textLink } from '../../components/ui/styles';
import type { Order } from '../../types';

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
                    <>
                        <button type="button" onClick={() => void downloadActive()} disabled={format === 'invoice' && !invoice} className={button('secondary', 'sm')}>
                            {t('documents.download')}
                        </button>
                        <button type="button" onClick={printActive} disabled={format === 'invoice' && !invoice} className={cx(button('secondary', 'sm'), 'no-print')}>
                            <Printer aria-hidden="true" className="h-4 w-4" />
                            {t('documents.print')}
                        </button>
                    </>
                }
            />

            <div className="flex flex-wrap items-end gap-4 no-print">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('documents.format')}</span>
                    <div role="group" aria-label={t('documents.format')} className="flex flex-wrap gap-2">
                        <ChipToggle active={format === 'ticket'} onClick={() => setFormat('ticket')}>
                            {t('documents.format.ticket')}
                        </ChipToggle>
                        <ChipToggle active={format === 'invoice'} onClick={() => setFormat('invoice')}>
                            {t('documents.format.invoice')}
                        </ChipToggle>
                    </div>
                </div>
                {format === 'ticket' && (
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
                )}
            </div>

            {order.sync_status !== 'synced' && (
                <Alert tone={order.sync_status === 'conflict' ? 'error' : 'warning'} icon={WifiOff} className="no-print">
                    {order.sync_status === 'pending'
                        ? t('documents.offline.pending', { uuid: order.client_local_uuid ?? '—' })
                        : t('documents.offline.conflict')}
                </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-2 no-print">
                <section className={cx(card, 'space-y-3 p-5')}>
                    <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('documents.ticketPreview')}</h2>
                    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white text-black shadow-sm dark:border-ink-700">
                        <TicketReceiptContent order={order} />
                    </div>
                </section>

                <section className={cx(card, 'space-y-3 p-5')}>
                    <h2 className="text-sm font-bold text-ink-900 dark:text-white">{t('documents.invoicePreview')}</h2>
                    {invoice && invoicePdfUrl ? (
                        <iframe title={t('documents.invoicePreview')} src={invoicePdfUrl} className="h-[520px] w-full rounded-xl border border-ink-200 dark:border-ink-700" />
                    ) : invoice ? (
                        <div className="flex h-[520px] items-center justify-center">
                            <Spinner className="h-6 w-6" />
                        </div>
                    ) : (
                        <EmptyState icon={Receipt} title={t('documents.invoiceMissingTitle')} description={t('documents.invoiceMissingHint')} />
                    )}
                </section>
            </div>

            <section className={cx(card, 'space-y-4 p-5 no-print')}>
                <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                    <Mail aria-hidden="true" className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                    {t('documents.sendTo')}
                </h2>
                {!hasEmail ? (
                    <Alert tone="warning">{t('documents.noEmail')}</Alert>
                ) : (
                    <>
                        {sendResult && <Alert tone={sendResult.tone}>{sendResult.message}</Alert>}
                        <button type="button" onClick={() => void sendActive()} disabled={sending || !canSend} className={button('primary', 'md')}>
                            {sending ? <Spinner className="h-4 w-4" /> : <Mail aria-hidden="true" className="h-4 w-4" />}
                            {t('documents.send')} — {order.client?.email}
                        </button>
                    </>
                )}
            </section>

            {printTicket && <PrintableTicket order={order} copies={copies} />}
        </div>
    );
}
