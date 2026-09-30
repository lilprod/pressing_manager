import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleDollarSign, FileCheck2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';
import { useFormat } from '../lib/format';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../components/ui/Feedback';
import Pagination from '../components/ui/Pagination';
import { card, cx } from '../components/ui/styles';
import type { Invoice, Paginated } from '../types';

export default function InvoicesOutstandingPage() {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();
    const { activeAgencyId } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Invoice>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [totalDue, setTotalDue] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        api
            .get<Paginated<Invoice> & { total_outstanding: number }>(`/invoices?${params}`)
            .then((res) => {
                setInvoices(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
                setTotalDue(res.total_outstanding);
            })
            .catch(() => setInvoices([]))
            .finally(() => setLoading(false));
    }, [activeAgencyId, page]);

    useEffect(() => setPage(1), [activeAgencyId]);

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('invoice.outstandingTitle')}
                subtitle={t('invoice.outstandingSubtitle')}
                icon={CircleDollarSign}
            />

            {loading ? (
                <LoadingState />
            ) : invoices.length === 0 ? (
                <div className={card}>
                    <EmptyState icon={FileCheck2} title={t('invoice.noOutstanding')} description={t('invoice.noOutstandingHint')} />
                </div>
            ) : (
                <>
                    <div className={cx(card, 'flex flex-wrap items-center justify-between gap-3 px-5 py-4')}>
                        <span className="text-sm font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">
                            {t('invoice.totalOutstanding')}
                        </span>
                        <span className="font-display text-2xl font-extrabold tabular-nums text-red-700 dark:text-red-300">{money(totalDue)}</span>
                    </div>

                    <div className={cx(card, 'overflow-hidden')}>
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {invoices.map((invoice) => {
                                const row = (
                                    <div className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-ink-50 focus-visible:bg-ink-50 sm:gap-4 sm:px-5 dark:hover:bg-ink-800/50 dark:focus-visible:bg-ink-800/50">
                                        <Avatar firstName={invoice.client?.first_name} lastName={invoice.client?.last_name} className="hidden sm:inline-flex" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="font-display font-bold text-ink-900 dark:text-white">
                                                    {t('invoice.number')}
                                                    {invoice.invoice_number}
                                                </span>
                                                <StatusBadge kind="invoice" status={invoice.status} />
                                            </div>
                                            <p className="truncate text-sm text-ink-600 dark:text-ink-350">
                                                {invoice.client?.first_name} {invoice.client?.last_name}
                                                {invoice.issued_at && (
                                                    <>
                                                        <span aria-hidden="true"> · </span>
                                                        {dateTime(invoice.issued_at)}
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                                            <div className="text-right">
                                                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                                                    {t('invoice.balanceDue')}
                                                </p>
                                                <p className="font-display font-bold tabular-nums text-red-700 dark:text-red-300">
                                                    {money(invoice.balance_due ?? 0)}
                                                </p>
                                            </div>
                                        </div>
                                        {invoice.order_id && (
                                            <ChevronRight
                                                aria-hidden="true"
                                                className="hidden h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-700 sm:block dark:group-hover:text-brand-300"
                                            />
                                        )}
                                    </div>
                                );
                                return (
                                    <li key={invoice.id}>
                                        {invoice.order_id ? <Link to={`/orders/${invoice.order_id}`}>{row}</Link> : row}
                                    </li>
                                );
                            })}
                        </ul>
                        <Pagination meta={meta} onPageChange={setPage} />
                    </div>
                </>
            )}
        </div>
    );
}
