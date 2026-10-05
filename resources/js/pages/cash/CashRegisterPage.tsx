import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownCircle, Banknote, Lock, PiggyBank, Plus, Receipt, Scale, ShieldAlert, Wallet, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { useOnlineStatus } from '../../lib/useOnlineStatus';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { StatCard } from '../../components/ui/Metrics';
import SegmentedBar from '../../components/ui/SegmentedBar';
import CashFlowBars from '../../components/ui/CashFlowBars';
import CashJournalSection from './CashJournalSection';
import { button, cardPadded, cx, input, sectionTitle } from '../../components/ui/styles';
import type { CashFlowSeries, CashMovement, CashPaymentBreakdown, CashStats, CashSummary, Paginated } from '../../types';

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function CashRegisterPage() {
    const { t } = useI18n();
    const { money, dateTime, dayMonth } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;
    const online = useOnlineStatus();

    const [summary, setSummary] = useState<CashSummary | null>(null);
    const [stats, setStats] = useState<CashStats | null>(null);
    const [breakdown, setBreakdown] = useState<CashPaymentBreakdown | null>(null);
    const [flow, setFlow] = useState<CashFlowSeries | null>(null);
    const [pending, setPending] = useState<CashMovement[]>([]);
    const [date, setDate] = useState(today());
    const [loading, setLoading] = useState(true);
    const [validating, setValidating] = useState<number | null>(null);

    function reload() {
        if (!agencyId) return;
        const base = new URLSearchParams({ agency_id: String(agencyId) });
        const withDate = new URLSearchParams({ agency_id: String(agencyId), date });
        return Promise.all([
            api.get<CashSummary>(`/cash/summary?${base}`),
            api.get<CashStats>(`/cash/stats?${withDate}`),
            api.get<CashPaymentBreakdown>(`/cash/payment-breakdown?${base}`),
            api.get<CashFlowSeries>(`/cash/flow-series?${withDate}`),
            api.get<Paginated<CashMovement>>(`/cash/movements?${base}&status=en_attente&per_page=20`),
        ]).then(([summaryRes, statsRes, breakdownRes, flowRes, pendingRes]) => {
            setSummary(summaryRes);
            setStats(statsRes);
            setBreakdown(breakdownRes);
            setFlow(flowRes);
            setPending(pendingRes.data);
        });
    }

    useEffect(() => {
        if (!agencyId) {
            setSummary(null);
            setStats(null);
            setBreakdown(null);
            setFlow(null);
            setPending([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        reload()?.finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agencyId, date]);

    async function handleValidate(movementId: number) {
        setValidating(movementId);
        try {
            await api.post(`/cash/movements/${movementId}/validate`);
            await reload();
        } finally {
            setValidating(null);
        }
    }

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('cash.title')} subtitle={t('cash.subtitle')} icon={Wallet} />
                <EmptyState icon={Wallet} title={t('nav.allAgencies')} description={t('service.availabilityHint')} />
            </div>
        );
    }

    const activeToday = stats?.last_activity_at ? stats.last_activity_at.slice(0, 10) === today() : false;
    const variance = stats?.last_closure?.variance ?? null;

    return (
        <div className="space-y-6">
            <PageHeader
                title={
                    <span className="inline-flex items-center gap-2">
                        {t('cash.title')}
                        {activeToday && <Pill tone="emerald">{t('cash.stats.activeToday')}</Pill>}
                    </span>
                }
                subtitle={t('cash.subtitle')}
                icon={Wallet}
                actions={
                    <>
                        <input
                            type="date"
                            value={date}
                            max={today()}
                            onChange={(e) => setDate(e.target.value)}
                            className={cx(input, 'h-11 w-auto')}
                            aria-label={t('cash.stats.dateSelector')}
                        />
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
                    {pending.length > 0 && (
                        <section className={cx(cardPadded, 'space-y-3 border-amber-300 dark:border-amber-400/30')}>
                            <Alert tone="warning" icon={ShieldAlert}>
                                {t('cash.pending.blocker', { count: pending.length })}
                            </Alert>
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {pending.map((m) => (
                                    <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                                        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                            <p className="font-semibold text-ink-900 dark:text-ink-50">{m.reason}</p>
                                            <p className="text-xs text-ink-500 dark:text-ink-400">
                                                {t(`cash.movementCategory.${m.category}`)} · {dateTime(m.occurred_at)}
                                                {m.creator && ` · ${m.creator.name}`}
                                            </p>
                                        </div>
                                        <span className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(m.amount)}</span>
                                        <button
                                            type="button"
                                            onClick={() => void handleValidate(m.id)}
                                            disabled={validating === m.id}
                                            className={button('primary', 'sm')}
                                        >
                                            {validating === m.id ? <Spinner className="h-4 w-4" /> : null}
                                            {t('cash.pending.validate')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {stats && (
                        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
                            <StatCard label={t('cash.stats.revenueToday')} value={money(stats.revenue_today)} icon={Banknote} tone="emerald" />
                            <StatCard label={t('cash.stats.expensesToday')} value={money(stats.expenses_today)} icon={ArrowDownCircle} tone="rose" />
                            <StatCard label={t('cash.stats.outstanding')} value={money(stats.outstanding)} icon={PiggyBank} tone="amber" />
                            <StatCard
                                label={t('cash.stats.lastClosureVariance')}
                                value={variance === null ? '—' : money(variance)}
                                icon={Scale}
                                tone={variance === null ? 'neutral' : variance === 0 ? 'emerald' : 'sky'}
                                hint={stats.last_closure ? dateTime(stats.last_closure.closed_at) : t('cash.stats.noClosureYet')}
                            />
                        </div>
                    )}

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

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        {breakdown && (
                            <section className={cx(cardPadded, 'space-y-4')}>
                                <div>
                                    <h2 className={sectionTitle}>{t('cash.breakdown.title')}</h2>
                                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">
                                        {breakdown.since ? t('cash.summary.since', { date: dateTime(breakdown.since) }) : t('cash.summary.sinceNever')}
                                    </p>
                                </div>
                                {breakdown.total > 0 ? (
                                    <SegmentedBar
                                        money={money}
                                        segments={[
                                            {
                                                key: 'espece',
                                                label: t('cash.method.espece'),
                                                amount: breakdown.by_method.espece.amount,
                                                percent: breakdown.by_method.espece.percent,
                                                colorClassName: 'bg-brand-600 dark:bg-brand-400',
                                            },
                                            {
                                                key: 'mobile_money',
                                                label: t('cash.method.mobile_money'),
                                                amount: breakdown.by_method.mobile_money.amount,
                                                percent: breakdown.by_method.mobile_money.percent,
                                                colorClassName: 'bg-sky-500 dark:bg-sky-400',
                                            },
                                            {
                                                key: 'carte',
                                                label: t('cash.method.carte'),
                                                amount: breakdown.by_method.carte.amount,
                                                percent: breakdown.by_method.carte.percent,
                                                colorClassName: 'bg-accent-500 dark:bg-accent-400',
                                            },
                                        ]}
                                    />
                                ) : (
                                    <EmptyState icon={Receipt} title={t('cash.breakdown.none')} compact />
                                )}
                            </section>
                        )}

                        {flow && (
                            <section className={cx(cardPadded, 'space-y-4')}>
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className={sectionTitle}>{t('cash.flow.title')}</h2>
                                    <p
                                        className={cx(
                                            'font-display text-sm font-bold tabular-nums',
                                            flow.net_total >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
                                        )}
                                    >
                                        {t('cash.flow.net')} {money(flow.net_total)}
                                    </p>
                                </div>
                                <CashFlowBars series={flow.series} money={money} dateShort={dayMonth} className="h-32" />
                                <div className="flex gap-4 border-t border-ink-200/80 pt-3 text-xs dark:border-ink-800">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                                        {t('cash.flow.in')} {money(flow.in_total)}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500 dark:bg-red-400" />
                                        {t('cash.flow.out')} {money(flow.out_total)}
                                    </span>
                                </div>
                            </section>
                        )}
                    </div>

                    <section className={cx(cardPadded, 'flex items-center gap-3')}>
                        <span
                            className={cx(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
                                online
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25'
                                    : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25',
                            )}
                        >
                            {online ? <Wifi aria-hidden="true" className="h-5 w-5" /> : <WifiOff aria-hidden="true" className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">{online ? t('login.online') : t('login.offline')}</p>
                            <p className="text-xs text-ink-600 dark:text-ink-350">{t('cash.sync.hint')}</p>
                        </div>
                    </section>

                    <CashJournalSection agencyId={agencyId} />
                </>
            )}
        </div>
    );
}
