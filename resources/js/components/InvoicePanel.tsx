import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { Invoice, Order, Payment, PaymentMethod } from '../types';

const PAYMENT_METHOD_LABEL_KEYS: Record<PaymentMethod, string> = {
    espece: 'payment.cash',
    carte: 'payment.card',
    flooz: 'payment.flooz',
    tmoney: 'payment.tmoney',
};
import { FileDown, FilePlus2, HandCoins, Plus } from 'lucide-react';
import { useFormat } from '../lib/format';
import PaymentMethodPicker from './PaymentMethodPicker';
import PaymentReferenceField from './PaymentReferenceField';
import StatusBadge from './ui/StatusBadge';
import { Alert, Spinner } from './ui/Feedback';
import { button, card, cx, input, label, sectionTitle } from './ui/styles';

/** Montant réellement encaissé (paiements complets uniquement) — même règle que balance_due côté serveur. */
function paidOf(invoice: Invoice): number {
    return (invoice.payments ?? []).filter((p) => p.status === 'complete').reduce((sum, p) => sum + p.amount, 0);
}

export default function InvoicePanel({ order, openPaymentSignal = 0 }: { order: Order; openPaymentSignal?: number }) {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { user } = useAuth();
    // L'API exige l'agence pour un rôle global et la refuse pour un rôle d'agence.
    const agencyScope = user?.agency_id === null ? { agency_id: order.agency_id } : {};
    const [invoice, setInvoice] = useState<Invoice | null>(order.invoice?.[0] ?? null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const initialInvoice = order.invoice?.[0] ?? null;
    const [amount, setAmount] = useState<number>(initialInvoice ? Math.max(0, initialInvoice.total_amount - paidOf(initialInvoice)) : order.total_amount);
    const [reference, setReference] = useState('');
    const [formOpen, setFormOpen] = useState(false);

    // « Ajouter un acompte » depuis l'en-tête de la fiche : ouvre le formulaire d'encaissement.
    useEffect(() => {
        if (openPaymentSignal > 0) setFormOpen(true);
    }, [openPaymentSignal]);

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
            if (method === 'espece') {
                await api.post<Payment>('/payments/cash', {
                    ...agencyScope,
                    client_id: order.client_id,
                    invoice_id: invoice.id,
                    amount,
                });
            } else {
                await api.post<Payment>('/payments/manual', {
                    ...agencyScope,
                    client_id: order.client_id,
                    invoice_id: invoice.id,
                    amount,
                    method,
                    reference: reference.trim(),
                });
            }
            setReference('');
            setFormOpen(false);
            const refreshed = await api.get<Invoice>(`/invoices/${invoice.id}`);
            setInvoice(refreshed);
            setAmount(Math.max(0, refreshed.total_amount - paidOf(refreshed)));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const paid = invoice ? paidOf(invoice) : 0;
    const remaining = invoice ? Math.max(0, invoice.total_amount - paid) : 0;
    const loyaltyDiscount = order.loyalty_discount_amount ?? 0;
    const promotionDiscount = order.promotion_discount_amount ?? 0;
    const manualDiscount = Math.max(0, (invoice?.discount_amount ?? order.discount_amount) - loyaltyDiscount - promotionDiscount);
    const completedPayments = (invoice?.payments ?? [])
        .slice()
        .sort((a, b) => new Date(b.paid_at ?? 0).getTime() - new Date(a.paid_at ?? 0).getTime());
    const row = 'flex items-center justify-between gap-3 text-sm';

    return (
        <section id="invoice-panel" aria-labelledby="invoice-heading" className={cx(card, 'scroll-mt-24 space-y-4 p-5')}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 id="invoice-heading" className={sectionTitle}>
                        {t('order.totalAndPayments')}
                    </h2>
                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('invoice.amountsTtc')}</p>
                </div>
                {invoice && <StatusBadge kind="invoice" status={invoice.status} />}
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            {!invoice ? (
                <div className="space-y-3">
                    <div className={row}>
                        <span className="text-ink-600 dark:text-ink-350">{t('order.detail.itemsSubtotal')}</span>
                        <span className="font-semibold tabular-nums">{money(order.total_amount + order.discount_amount)}</span>
                    </div>
                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('invoice.noneYet')}</p>
                    <button type="button" onClick={() => void createInvoice()} disabled={busy} className={button('primary', 'md', 'w-full')}>
                        {busy ? <Spinner className="h-5 w-5" /> : <FilePlus2 aria-hidden="true" className="h-5 w-5" />}
                        {t('order.createInvoice')}
                    </button>
                </div>
            ) : (
                <>
                    <dl className="space-y-1.5">
                        <div className={row}>
                            <dt className="text-ink-600 dark:text-ink-350">{t('order.detail.itemsSubtotal')}</dt>
                            <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
                        </div>
                        {manualDiscount > 0 && (
                            <div className={row}>
                                <dt className="text-ink-600 dark:text-ink-350">{t('invoice.commercialDiscount')}</dt>
                                <dd className="tabular-nums text-emerald-700 dark:text-emerald-300">−{money(manualDiscount)}</dd>
                            </div>
                        )}
                        {loyaltyDiscount > 0 && (
                            <div className={row}>
                                <dt className="text-ink-600 dark:text-ink-350">{t('invoice.loyaltyDiscount')}</dt>
                                <dd className="tabular-nums text-emerald-700 dark:text-emerald-300">−{money(loyaltyDiscount)}</dd>
                            </div>
                        )}
                        {promotionDiscount > 0 && (
                            <div className={row}>
                                <dt className="text-ink-600 dark:text-ink-350">
                                    {t('invoice.promotionDiscount')}
                                    {order.promotion ? ` · ${order.promotion.code}` : ''}
                                </dt>
                                <dd className="tabular-nums text-emerald-700 dark:text-emerald-300">−{money(promotionDiscount)}</dd>
                            </div>
                        )}
                        <div className={row}>
                            <dt className="text-ink-600 dark:text-ink-350">{t('invoice.tax')}</dt>
                            <dd className="tabular-nums">{money(invoice.tax_amount)}</dd>
                        </div>
                        <div className={cx(row, 'border-t border-ink-200/80 pt-2 dark:border-ink-800')}>
                            <dt className="font-semibold text-ink-900 dark:text-white">{t('common.total')}</dt>
                            <dd className="font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">{money(invoice.total_amount)}</dd>
                        </div>
                    </dl>

                    {completedPayments.length > 0 && (
                        <ul className="space-y-2">
                            {completedPayments.map((p) => (
                                <li
                                    key={p.id}
                                    className={cx(
                                        'rounded-xl px-3.5 py-2.5 text-sm',
                                        p.status === 'complete'
                                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100'
                                            : 'bg-ink-50 text-ink-700 dark:bg-ink-950/60 dark:text-ink-200',
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium">
                                            {t('invoice.depositLine', { method: t(PAYMENT_METHOD_LABEL_KEYS[p.method]) })}
                                        </span>
                                        <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                                    </div>
                                    <p className="text-xs opacity-80">
                                        {p.paid_at ? dateTime(p.paid_at) : '—'}
                                        {p.receiver && ` · ${t('invoice.receivedBy', { name: p.receiver.name })}`}
                                        {p.status !== 'complete' && ` · ${t(`payment.status.${p.status}`)}`}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div
                        className={cx(
                            'flex items-center justify-between gap-3 rounded-xl px-4 py-3',
                            remaining > 0 ? 'bg-amber-50 dark:bg-amber-400/10' : 'bg-emerald-50 dark:bg-emerald-400/10',
                        )}
                    >
                        <span className={cx('text-sm font-medium', remaining > 0 ? 'text-amber-900 dark:text-amber-100' : 'text-emerald-900 dark:text-emerald-100')}>
                            {remaining > 0 ? t('order.balanceDue.title') : t('invoice.fullyPaid')}
                        </span>
                        <span
                            className={cx(
                                'font-display text-xl font-extrabold tabular-nums',
                                remaining > 0 ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-800 dark:text-emerald-200',
                            )}
                        >
                            {money(remaining)}
                        </span>
                    </div>

                    {invoice.status !== 'payee' && invoice.status !== 'annulee' && (
                        formOpen ? (
                            <div className="space-y-4 border-t border-ink-200/80 pt-4 dark:border-ink-800">
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
                                {referenceRequired && <PaymentReferenceField method={method} value={reference} onChange={setReference} />}
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setFormOpen(false)} className={button('secondary', 'md')}>
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void pay()}
                                        disabled={busy || referenceMissing || amount <= 0}
                                        className={button('primary', 'md', 'flex-1')}
                                    >
                                        {busy ? <Spinner className="h-5 w-5" /> : <HandCoins aria-hidden="true" className="h-5 w-5" />}
                                        {t('payment.pay')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setFormOpen(true)} className={button('primary', 'md', 'w-full')}>
                                <Plus aria-hidden="true" className="h-4 w-4" />
                                {t('order.addDeposit')}
                            </button>
                        )
                    )}

                    {invoice.pdf_path && (
                        <button type="button" onClick={() => void downloadPdf()} className={cx(button('secondary', 'sm'), 'w-full')}>
                            <FileDown aria-hidden="true" className="h-4 w-4" />
                            {t('order.downloadPdf')}
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
