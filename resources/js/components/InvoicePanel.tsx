import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { Invoice, Order, Payment, PaymentMethod } from '../types';
import { CircleCheck, FileDown, FilePlus2, HandCoins, Receipt } from 'lucide-react';
import { useFormat } from '../lib/format';
import PaymentMethodPicker from './PaymentMethodPicker';
import PaymentReferenceField from './PaymentReferenceField';
import StatusBadge from './ui/StatusBadge';
import { Alert, Spinner } from './ui/Feedback';
import { button, card, cx, input, label, sectionTitle } from './ui/styles';

export default function InvoicePanel({ order }: { order: Order }) {
    const { t } = useI18n();
    const { money } = useFormat();
    const { user } = useAuth();
    // L'API exige l'agence pour un rôle global et la refuse pour un rôle d'agence.
    const agencyScope = user?.agency_id === null ? { agency_id: order.agency_id } : {};
    const [invoice, setInvoice] = useState<Invoice | null>(order.invoice?.[0] ?? null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const [amount, setAmount] = useState<number>(order.total_amount);
    const [reference, setReference] = useState('');
    const [lastPayment, setLastPayment] = useState<Payment | null>(null);

    const referenceRequired = method !== 'espece';
    const referenceMissing = referenceRequired && reference.trim() === '';

    async function createInvoice() {
        setBusy(true);
        setError(null);
        try {
            const created = await api.post<Invoice>(`/orders/${order.id}/invoice`);
            setInvoice(created);
            setAmount(created.total_amount);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function downloadPdf() {
        if (!invoice) return;
        const blob = await api.blob(`/invoices/${invoice.id}/pdf`);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function pay() {
        if (!invoice || referenceMissing) return;
        setBusy(true);
        setError(null);
        try {
            const payment =
                method === 'espece'
                    ? await api.post<Payment>('/payments/cash', {
                          ...agencyScope,
                          client_id: order.client_id,
                          invoice_id: invoice.id,
                          amount,
                      })
                    : await api.post<Payment>('/payments/manual', {
                          ...agencyScope,
                          client_id: order.client_id,
                          invoice_id: invoice.id,
                          amount,
                          method,
                          reference: reference.trim(),
                      });
            setLastPayment(payment);
            setReference('');
            const refreshed = await api.get<Invoice>(`/invoices/${invoice.id}`);
            setInvoice(refreshed);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="invoice-heading" className={cx(card, 'overflow-hidden')}>
            <div className="flex items-center justify-between gap-2 border-b border-ink-200/80 px-5 py-4 dark:border-ink-800">
                <h2 id="invoice-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <Receipt aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('order.invoice')}
                </h2>
                {invoice && <StatusBadge kind="invoice" status={invoice.status} />}
            </div>

            <div className="space-y-5 p-5">
                {error && <Alert tone="error">{error}</Alert>}

                {!invoice ? (
                    <div className="space-y-4 text-center">
                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('invoice.noneYet')}</p>
                        <button type="button" onClick={() => void createInvoice()} disabled={busy} className={button('primary', 'lg', 'w-full')}>
                            {busy ? <Spinner className="h-5 w-5" /> : <FilePlus2 aria-hidden="true" className="h-5 w-5" />}
                            {t('order.createInvoice')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="space-y-3 rounded-xl bg-ink-50 px-4 py-3.5 dark:bg-ink-950/60">
                            <dl className="space-y-1 text-sm">
                                <div className="flex items-center justify-between text-ink-600 dark:text-ink-350">
                                    <dt>{t('invoice.subtotal')}</dt>
                                    <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
                                </div>
                                {invoice.discount_amount > 0 && (
                                    <div className="flex items-center justify-between text-ink-600 dark:text-ink-350">
                                        <dt>{t('invoice.discount')}</dt>
                                        <dd className="tabular-nums">-{money(invoice.discount_amount)}</dd>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-ink-600 dark:text-ink-350">
                                    <dt>{t('invoice.tax')}</dt>
                                    <dd className="tabular-nums">{money(invoice.tax_amount)}</dd>
                                </div>
                            </dl>
                            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-ink-200/80 pt-3 dark:border-ink-800">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">{t('invoice.amountDue')}</p>
                                    <p className="whitespace-nowrap font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">{money(invoice.total_amount)}</p>
                                </div>
                                {invoice.pdf_path && (
                                    <button type="button" onClick={() => void downloadPdf()} className={button('secondary', 'sm')}>
                                        <FileDown aria-hidden="true" className="h-4 w-4" />
                                        {t('order.downloadPdf')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {invoice.status === 'payee' ? (
                            <Alert tone="success" icon={CircleCheck}>
                                {t('invoice.fullyPaid')}
                            </Alert>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor={`invoice-amount-${order.id}`} className={label}>
                                        {t('payment.amount')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            id={`invoice-amount-${order.id}`}
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                            className={cx(input, 'pr-16 font-semibold tabular-nums')}
                                        />
                                        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-600 dark:text-ink-350">
                                            {t('common.currency')}
                                        </span>
                                    </div>
                                </div>

                                <PaymentMethodPicker name={`invoice-method-${order.id}`} value={method} onChange={setMethod} layout="compact" />

                                {referenceRequired && (
                                    <PaymentReferenceField method={method} value={reference} onChange={setReference} />
                                )}

                                <button
                                    type="button"
                                    onClick={() => void pay()}
                                    disabled={busy || referenceMissing}
                                    className={button('success', 'lg', 'w-full')}
                                >
                                    {busy ? <Spinner className="h-5 w-5" /> : <HandCoins aria-hidden="true" className="h-5 w-5" />}
                                    {t('payment.pay')}
                                </button>
                            </div>
                        )}

                        {lastPayment && (
                            <div
                                role="status"
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 px-3.5 py-3 text-sm dark:border-ink-700"
                            >
                                <span className="inline-flex items-center gap-2 font-medium text-ink-800 dark:text-ink-100">
                                    {money(lastPayment.amount)}
                                </span>
                                <StatusBadge kind="payment" status={lastPayment.status} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
