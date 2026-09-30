import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, StickyNote } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { Alert, LoadingState } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { cardPadded, cx, sectionTitle, textLink } from '../../components/ui/styles';
import type { CashClosure } from '../../types';

export default function CashClosureDetail() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();
    const { money, dateTime, date } = useFormat();

    const [closure, setClosure] = useState<CashClosure | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        api
            .get<CashClosure>(`/cash/closures/${id}`)
            .then(setClosure)
            .catch((err) => {
                if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const backLink = (
        <Link to="/cash" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('cash.backToRegister')}
        </Link>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (notFound || !closure) {
        return (
            <div className="space-y-4">
                {backLink}
                <Alert tone="error">{t('cash.closureDetail.notFound')}</Alert>
            </div>
        );
    }

    return (
        <div className="max-w-xl space-y-4">
            {backLink}

            <section className={cx(cardPadded, 'space-y-5')}>
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700">
                        <Lock aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">{t('cash.closureDetail.title')}</h1>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{date(closure.business_date)}</p>
                    </div>
                </div>

                <dl className="space-y-2 border-t border-ink-200/80 pt-4 text-sm dark:border-ink-800">
                    <div className="flex justify-between">
                        <dt className="text-ink-600 dark:text-ink-350">{t('cash.summary.opening')}</dt>
                        <dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{money(closure.opening_balance)}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-ink-600 dark:text-ink-350">{t('cash.summary.cashPayments')}</dt>
                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(closure.cash_payments_total)}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-ink-600 dark:text-ink-350">{t('cash.summary.manualIn')}</dt>
                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(closure.manual_in_total)}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-ink-600 dark:text-ink-350">{t('cash.summary.manualOut')}</dt>
                        <dd className="font-semibold tabular-nums text-red-700 dark:text-red-400">-{money(closure.manual_out_total)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-ink-200/80 pt-2 dark:border-ink-800">
                        <dt className="font-semibold text-ink-900 dark:text-white">{t('cash.summary.expected')}</dt>
                        <dd className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(closure.expected_balance)}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="font-semibold text-ink-900 dark:text-white">{t('cash.closures.counted')}</dt>
                        <dd className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(closure.counted_balance)}</dd>
                    </div>
                </dl>

                <div className="flex items-center justify-between border-t border-ink-200/80 pt-4 dark:border-ink-800">
                    <span className={sectionTitle}>{t('cash.closures.variance')}</span>
                    {closure.variance === 0 ? (
                        <Pill tone="emerald">{t('cash.closureForm.varianceOk')}</Pill>
                    ) : closure.variance > 0 ? (
                        <Pill tone="sky">+{money(closure.variance)}</Pill>
                    ) : (
                        <Pill tone="rose">{money(closure.variance)}</Pill>
                    )}
                </div>

                {closure.notes && (
                    <div className="space-y-1.5 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                        <h3 className={cx(sectionTitle, 'flex items-center gap-2 text-sm')}>
                            <StickyNote aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                            {t('cash.closureForm.notes')}
                        </h3>
                        <p className="whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">{closure.notes}</p>
                    </div>
                )}

                <p className="border-t border-ink-200/80 pt-4 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                    {t('cash.closureDetail.closedBy')} {closure.closer?.name ?? '—'} · {dateTime(closure.closed_at)}
                </p>
            </section>
        </div>
    );
}
