import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownCircle, Banknote, Download, Lock, PiggyBank, Plus, Receipt, Scale, ShieldAlert, Wallet, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { useLastSyncedAt, useOnlineStatus } from '../../lib/useOnlineStatus';
import { useSyncQueue } from '../../lib/useSyncQueue';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { StatCard } from '../../components/ui/Metrics';
import CashFlowBars from '../../components/ui/CashFlowBars';
import CashJournalSection from './CashJournalSection';
import CashSessionsCard from './CashSessionsCard';
import { button, cardPadded, cx, input, sectionTitle } from '../../components/ui/styles';
import type { CashFlowSeries, CashMovement, CashPaymentBreakdown, CashStats, CashSummary, Paginated } from '../../types';

const METHOD_COLORS: Record<'espece' | 'mobile_money' | 'carte', string> = {
    espece: 'bg-brand-600 dark:bg-brand-400',
    mobile_money: 'bg-sky-500 dark:bg-sky-400',
    carte: 'bg-accent-500 dark:bg-accent-400',
};

function SituationRow({ label, hint, value, tone }: { label: string; hint: string; value: string; tone?: 'in' | 'out' }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="min-w-0">
                <span className="block font-medium text-ink-800 dark:text-ink-100">{label}</span>
                <span className="block text-xs text-ink-500 dark:text-ink-400">{hint}</span>
            </dt>
            <dd
                className={cx(
                    'shrink-0 font-semibold tabular-nums',
                    tone === 'in' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'out' ? 'text-red-700 dark:text-red-400' : 'text-ink-900 dark:text-white',
                )}
            >
                {value}
            </dd>
        </div>
    );
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function CashRegisterPage() {
    const { t } = useI18n();
    const { money, dateTime, dayMonth } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;
    const online = useOnlineStatus();
    const lastSyncedAt = useLastSyncedAt();
    const queue = useSyncQueue();
    const [exporting, setExporting] = useState(false);

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

    // « Exporter » : journal de caisse du jour sélectionné (même export Excel que le journal).
    async function exportDay() {
        if (!agencyId) return;
        setExporting(true);
        try {
            const params = new URLSearchParams({ agency_id: String(agencyId), from: date, to: date });
            const blob = await api.blob(`/cash/ledger/export/excel?${params}`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `caisse-${date}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    }

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
                            className={cx(input, 'h-10 !w-44')}
                            aria-label={t('cash.stats.dateSelector')}
                        />
                        <button type="button" onClick={() => void exportDay()} disabled={exporting} className={button('secondary', 'sm')}>
                            {exporting ? <Spinner className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />}
                            {t('cash.exportDay')}
                        </button>
                        <Link to="/cash/closures/new" className={button('secondary', 'sm')}>
                            <Lock aria-hidden="true" className="h-4 w-4" />
                            {t('cash.closeRegister')}
                        </Link>
                        <Link to="/cash/movements/new" className={button('primary', 'sm')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('cash.newMovement')}
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

                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                        {summary && (
                            <section className={cx(cardPadded, 'space-y-4')}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <h2 className={sectionTitle}>{t('cash.situation.title')}</h2>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">
                                            {summary.since ? t('cash.summary.since', { date: dateTime(summary.since) }) : t('cash.summary.sinceNever')}
                                        </p>
                                    </div>
                                    {activeToday && <Pill tone="emerald">{t('cash.situation.open')}</Pill>}
                                </div>
                                <dl className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                                    <SituationRow label={t('cash.summary.opening')} hint={t('cash.situation.openingHint')} value={money(summary.opening_balance)} />
                                    <SituationRow label={t('cash.summary.cashPayments')} hint={t('cash.situation.inDrawer')} value={`+${money(summary.cash_payments_total)}`} tone="in" />
                                    <SituationRow label={t('cash.method.mobile_money')} hint={t('cash.situation.outsideDrawer')} value={`+${money(summary.by_method.mobile_money.theoretical)}`} tone="in" />
                                    <SituationRow label={t('cash.method.carte')} hint={t('cash.situation.outsideDrawer')} value={`+${money(summary.by_method.carte.theoretical)}`} tone="in" />
                                    <SituationRow label={t('cash.situation.manualIn')} hint={t('cash.situation.manualHint')} value={`+${money(summary.manual_in_total)}`} tone="in" />
                                    <SituationRow label={t('cash.situation.manualOut')} hint={t('cash.situation.manualHint')} value={`-${money(summary.manual_out_total)}`} tone="out" />
                                </dl>
                            </section>
                        )}

                        <div className="min-w-0 space-y-4">
                            {summary && (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <section className="rounded-2xl bg-brand-900 p-5 text-white shadow-sm">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-100/80">{t('cash.summary.expected')}</p>
                                        <p className="mt-2 font-display text-3xl font-bold tabular-nums">{money(summary.expected_balance)}</p>
                                        <p className="mt-1 text-xs text-brand-100/70">{t('cash.situation.expectedHint')}</p>
                                    </section>
                                    {breakdown && (
                                        <section className={cx(cardPadded, 'border-2 border-brand-200 dark:border-brand-400/30')}>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('cash.situation.allMethods')}</p>
                                            <p className="mt-2 font-display text-3xl font-bold tabular-nums text-ink-900 dark:text-white">{money(breakdown.total)}</p>
                                            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('cash.situation.allMethodsHint')}</p>
                                        </section>
                                    )}
                                </div>
                            )}

                            {breakdown && (
                                <section className={cx(cardPadded, 'space-y-4')}>
                                    <div>
                                        <h2 className={sectionTitle}>{t('cash.breakdown.title')}</h2>
                                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">
                                            {breakdown.since ? t('cash.summary.since', { date: dateTime(breakdown.since) }) : t('cash.summary.sinceNever')}
                                        </p>
                                    </div>
                                    {breakdown.total > 0 ? (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            {(['espece', 'mobile_money', 'carte'] as const).map((method) => (
                                                <div key={method} className="space-y-1.5">
                                                    <div className="flex items-baseline justify-between gap-2 text-xs">
                                                        <span className="font-semibold text-ink-700 dark:text-ink-200">{t(`cash.method.${method}`)}</span>
                                                        <span className="tabular-nums text-ink-500 dark:text-ink-400">{breakdown.by_method[method].percent}%</span>
                                                    </div>
                                                    <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                                                        <div className={cx('h-full rounded-full', METHOD_COLORS[method])} style={{ width: `${breakdown.by_method[method].percent}%` }} />
                                                    </div>
                                                    <p className="text-sm font-semibold tabular-nums text-ink-900 dark:text-white">{money(breakdown.by_method[method].amount)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState icon={Receipt} title={t('cash.breakdown.none')} compact />
                                    )}
                                </section>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        {flow && (
                            <section className={cx(cardPadded, 'space-y-4')}>
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div>
                                        <h2 className={sectionTitle}>{t('cash.flow.title')}</h2>
                                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.flow.subtitle')}</p>
                                    </div>
                                    <p
                                        className={cx(
                                            'font-display text-sm font-bold tabular-nums',
                                            flow.net_total >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
                                        )}
                                    >
                                        {t('cash.flow.net')} {money(flow.net_total)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-4 text-xs">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                                        {t('cash.flow.in')} {money(flow.in_total)}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500 dark:bg-red-400" />
                                        {t('cash.flow.out')} {money(flow.out_total)}
                                    </span>
                                </div>
                                <CashFlowBars series={flow.series} money={money} dateShort={dayMonth} className="h-40" />
                            </section>
                        )}

                        <section className={cx(cardPadded, 'space-y-3')}>
                            <div>
                                <h2 className={sectionTitle}>{t('cash.sync.title')}</h2>
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.sync.subtitle')}</p>
                            </div>
                            <div
                                className={cx(
                                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                                    online ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
                                )}
                            >
                                {online ? <Wifi aria-hidden="true" className="h-5 w-5 shrink-0" /> : <WifiOff aria-hidden="true" className="h-5 w-5 shrink-0" />}
                                <span>
                                    <span className="block font-semibold">{online ? t('login.online') : t('login.offline')}</span>
                                    <span className="block text-xs">{lastSyncedAt ? t('pickup.sync.lastSync', { time: dateTime(lastSyncedAt) }) : t('pickup.sync.neverSynced')}</span>
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-ink-600 dark:text-ink-350">{t('cash.sync.queue')}</span>
                                <Pill tone={queue.length > 0 ? 'amber' : 'emerald'}>{t('order.offline.queueCount', { count: queue.length })}</Pill>
                            </div>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.sync.hint')}</p>
                            <Link to="/synchronisation" className={cx(button('secondary', 'sm'), 'w-full justify-center')}>
                                {t('cash.sync.open')}
                            </Link>
                        </section>
                    </div>

                    <CashSessionsCard agencyId={agencyId} date={date} />

                    <CashJournalSection agencyId={agencyId} />
                </>
            )}
        </div>
    );
}
