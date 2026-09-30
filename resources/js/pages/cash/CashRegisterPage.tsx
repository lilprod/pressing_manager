import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, Lock, Plus, Wallet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cardPadded, cx, sectionTitle } from '../../components/ui/styles';
import type { CashClosure, CashMovement, CashSummary, Paginated } from '../../types';

export default function CashRegisterPage() {
    const { t } = useI18n();
    const { money, dateTime, date } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [summary, setSummary] = useState<CashSummary | null>(null);
    const [movements, setMovements] = useState<CashMovement[]>([]);
    const [closures, setClosures] = useState<CashClosure[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!agencyId) {
            setSummary(null);
            setMovements([]);
            setClosures([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const params = new URLSearchParams({ agency_id: String(agencyId) });
        Promise.all([
            api.get<CashSummary>(`/cash/summary?${params}`),
            api.get<Paginated<CashMovement>>(`/cash/movements?${params}&per_page=8`),
            api.get<Paginated<CashClosure>>(`/cash/closures?${params}&per_page=5`),
        ])
            .then(([summaryRes, movementsRes, closuresRes]) => {
                setSummary(summaryRes);
                setMovements(movementsRes.data);
                setClosures(closuresRes.data);
            })
            .finally(() => setLoading(false));
    }, [agencyId]);

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('cash.title')} subtitle={t('cash.subtitle')} icon={Wallet} />
                <EmptyState icon={Wallet} title={t('nav.allAgencies')} description={t('service.availabilityHint')} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('cash.title')}
                subtitle={t('cash.subtitle')}
                icon={Wallet}
                actions={
                    <>
                        <Link to="/cash/movements/new" className={button('secondary', 'md')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('cash.newMovement')}
                        </Link>
                        <Link to="/cash/closures/new" className={button('primary', 'md')}>
                            <Lock aria-hidden="true" className="h-4 w-4" />
                            {t('cash.closeRegister')}
                        </Link>
                    </>
                }
            />

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    {summary && (
                        <section className={cx(cardPadded, 'space-y-4')}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className={sectionTitle}>{t('cash.summary.expected')}</h2>
                                <p className="text-xs text-ink-500 dark:text-ink-400">
                                    {summary.since ? t('cash.summary.since', { date: dateTime(summary.since) }) : t('cash.summary.sinceNever')}
                                </p>
                            </div>
                            <p className="font-display text-4xl font-bold tabular-nums text-ink-900 dark:text-white">{money(summary.expected_balance)}</p>
                            <dl className="grid grid-cols-2 gap-4 border-t border-ink-200/80 pt-4 text-sm sm:grid-cols-4 dark:border-ink-800">
                                <div>
                                    <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.opening')}</dt>
                                    <dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{money(summary.opening_balance)}</dd>
                                </div>
                                <div>
                                    <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.cashPayments')}</dt>
                                    <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                        +{money(summary.cash_payments_total)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.manualIn')}</dt>
                                    <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(summary.manual_in_total)}</dd>
                                </div>
                                <div>
                                    <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.manualOut')}</dt>
                                    <dd className="font-semibold tabular-nums text-red-700 dark:text-red-400">-{money(summary.manual_out_total)}</dd>
                                </div>
                            </dl>
                        </section>
                    )}

                    <div className="grid items-start gap-6 lg:grid-cols-2">
                        <section className={cx(card, 'overflow-hidden')}>
                            <h2 className={cx(sectionTitle, 'px-5 pt-5')}>{t('cash.movements.title')}</h2>
                            {movements.length === 0 ? (
                                <EmptyState icon={Wallet} title={t('cash.movements.none')} compact />
                            ) : (
                                <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
                                    {movements.map((m) => (
                                        <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                                            <span
                                                className={cx(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
                                                    m.type === 'entree'
                                                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25'
                                                        : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25',
                                                )}
                                            >
                                                {m.type === 'entree' ? (
                                                    <ArrowUpCircle aria-hidden="true" className="h-4 w-4" />
                                                ) : (
                                                    <ArrowDownCircle aria-hidden="true" className="h-4 w-4" />
                                                )}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{m.reason}</p>
                                                <p className="text-xs text-ink-500 dark:text-ink-400">
                                                    {dateTime(m.occurred_at)}
                                                    {m.creator && ` · ${m.creator.name}`}
                                                </p>
                                            </div>
                                            <span
                                                className={cx(
                                                    'shrink-0 font-display font-bold tabular-nums',
                                                    m.type === 'entree' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
                                                )}
                                            >
                                                {m.type === 'entree' ? '+' : '-'}
                                                {money(m.amount)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className={cx(card, 'overflow-hidden')}>
                            <h2 className={cx(sectionTitle, 'px-5 pt-5')}>{t('cash.closures.title')}</h2>
                            {closures.length === 0 ? (
                                <EmptyState icon={Lock} title={t('cash.closures.none')} compact />
                            ) : (
                                <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
                                    {closures.map((c) => (
                                        <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-ink-900 dark:text-ink-50">{date(c.business_date)}</p>
                                                <p className="text-xs text-ink-500 dark:text-ink-400">
                                                    {t('cash.closures.expected')} {money(c.expected_balance)} · {t('cash.closures.counted')}{' '}
                                                    {money(c.counted_balance)}
                                                </p>
                                            </div>
                                            {c.variance === 0 ? (
                                                <Pill tone="emerald">{t('cash.closureForm.varianceOk')}</Pill>
                                            ) : c.variance > 0 ? (
                                                <Pill tone="sky">+{money(c.variance)}</Pill>
                                            ) : (
                                                <Pill tone="rose">{money(c.variance)}</Pill>
                                            )}
                                            <Link to={`/cash/closures/${c.id}`} className={button('ghost', 'sm')}>
                                                {t('cash.closures.view')}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
