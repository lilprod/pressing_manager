import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { Invoice, Order, Payment, PaymentMethod } from '../types';

const REMOTE_METHODS: PaymentMethod[] = ['carte', 'flooz', 'tmoney'];

export default function InvoicePanel({ order }: { order: Order }) {
    const { t } = useI18n();
    const { user } = useAuth();
    // L'API exige l'agence pour un rôle global et la refuse pour un rôle d'agence.
    const agencyScope = user?.agency_id === null ? { agency_id: order.agency_id } : {};
    const [invoice, setInvoice] = useState<Invoice | null>(order.invoice?.[0] ?? null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const [amount, setAmount] = useState<number>(order.total_amount);
    const [pollingPayment, setPollingPayment] = useState<Payment | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current);
    }, []);

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
        if (!invoice) return;
        setBusy(true);
        setError(null);
        try {
            if (method === 'espece') {
                await api.post<Payment>('/payments/cash', {
                    ...agencyScope,
                    client_id: order.client_id,
                    invoice_id: invoice.id,
                    amount,
                });
                const refreshed = await api.get<Invoice>(`/invoices/${invoice.id}`);
                setInvoice(refreshed);
            } else {
                const payment = await api.post<Payment>('/payments/remote', {
                    ...agencyScope,
                    client_id: order.client_id,
                    invoice_id: invoice.id,
                    amount,
                    method,
                });
                setPollingPayment(payment);
                pollRef.current = setInterval(async () => {
                    const latest = await api.get<Payment>(`/payments/${payment.id}`);
                    if (latest.status !== 'en_attente') {
                        setPollingPayment(latest);
                        if (pollRef.current) clearInterval(pollRef.current);
                        const refreshedInvoice = await api.get<Invoice>(`/invoices/${invoice.id}`);
                        setInvoice(refreshedInvoice);
                    }
                }, 4000);
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="invoice-heading" className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <h2 id="invoice-heading" className="font-medium">
                {t('order.invoice')}
            </h2>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {!invoice ? (
                <button
                    type="button"
                    onClick={() => void createInvoice()}
                    disabled={busy}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {t('order.createInvoice')}
                </button>
            ) : (
                <div className="space-y-3">
                    <p className="text-sm">
                        {t('common.status')}: <strong>{invoice.status}</strong> — {invoice.total_amount} FCFA
                    </p>

                    {invoice.pdf_path && (
                        <button
                            type="button"
                            onClick={() => void downloadPdf()}
                            className="text-sm text-indigo-600 underline dark:text-indigo-400"
                        >
                            {t('order.downloadPdf')}
                        </button>
                    )}

                    {invoice.status !== 'payee' && (
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="text-sm">
                                {t('payment.amount')}
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    className="ml-2 w-28 rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                />
                            </label>
                            <label className="text-sm">
                                {t('common.status')}
                                <select
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                                    className="ml-2 rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                >
                                    <option value="espece">{t('payment.cash')}</option>
                                    {REMOTE_METHODS.map((m) => (
                                        <option key={m} value={m}>
                                            {t(`payment.${m === 'carte' ? 'card' : m}`)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={() => void pay()}
                                disabled={busy}
                                className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                            >
                                {method === 'espece' ? t('payment.pay') : t('payment.initiate')}
                            </button>
                        </div>
                    )}

                    {pollingPayment && (
                        <p role="status" className="text-sm">
                            {t('payment.amount')}: {pollingPayment.amount} FCFA — {t(`payment.status.${pollingPayment.status}`)}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
