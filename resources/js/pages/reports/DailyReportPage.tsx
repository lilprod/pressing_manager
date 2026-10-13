import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, BadgeAlert, BadgePercent, Banknote, CalendarDays, FileSpreadsheet, FileText, Receipt, Scale, ShieldAlert, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { ProgressBar, StatCard, SectionCard, percentChange, trend } from '../../components/ui/Metrics';
import SegmentedBar from '../../components/ui/SegmentedBar';
import { button, cx, input } from '../../components/ui/styles';
import type { DailyReport } from '../../types';

/* « Bilan journalier et performance caissiers » (capture Figma, audit du 2026-10-13).
 * Toujours à une seule agence (comme le Centre de caisse) : un bilan de caisse raisonne
 * par caisse physique. Sessions de caisse par caissier (cash_sessions), rapprochement du
 * jour, remises sensibles (> 10 % du dépôt), productivité vs objectif d'agence
 * (agency_settings.cashier_daily_target, rien n'est affiché si aucun objectif n'est
 * configuré), comparaison au même jour de la semaine précédente, exports PDF/Excel. */

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function DailyReportPage() {
    const { t } = useI18n();
    const { money, time, dayMonth } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [date, setDate] = useState(today());
    const [report, setReport] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

    useEffect(() => {
        if (!agencyId) {
            setReport(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const query = new URLSearchParams({ agency_id: String(agencyId), date });
        api.get<DailyReport>(`/reports/daily?${query}`)
            .then(setReport)
            .finally(() => setLoading(false));
    }, [agencyId, date]);

    async function exportFile(kind: 'pdf' | 'excel') {
        if (!agencyId) return;
        setExporting(kind);
        try {
            const query = new URLSearchParams({ agency_id: String(agencyId), date });
            const blob = await api.blob(`/reports/daily/export/${kind}?${query}`);
            downloadBlob(blob, `bilan-journalier-${date}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`);
        } finally {
            setExporting(null);
        }
    }

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('dailyReport.title')} subtitle={t('dailyReport.subtitle')} icon={Receipt} />
                <EmptyState icon={Receipt} title={t('nav.allAgencies')} description={t('service.availabilityHint')} />
            </div>
        );
    }

    const maxHour = report ? Math.max(1, ...report.payments_by_hour.map((p) => p.total)) : 1;

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('dailyReport.title')}
                subtitle={t('dailyReport.subtitle')}
                icon={Receipt}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cx(input, 'h-10 pl-9')} />
                        </div>
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('pdf')} className={button('secondary', 'md', 'h-10')}>
                            <FileText aria-hidden="true" className="h-4 w-4" />
                            PDF
                        </button>
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('excel')} className={button('secondary', 'md', 'h-10')}>
                            <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                            {t('dailyReport.exportExcel')}
                        </button>
                    </div>
                }
            />

            {loading || !report ? (
                <LoadingState label={t('common.loading')} />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-4">
                        <StatCard
                            label={t('dailyReport.revenue')}
                            value={money(report.stats.revenue_today)}
                            icon={Banknote}
                            tone="emerald"
                            {...trend(percentChange(report.stats.revenue_today, report.comparison.revenue_previous), t('dailyReport.vsLastWeek', { date: dayMonth(report.comparison.previous_date) }))}
                        />
                        <StatCard label={t('dailyReport.outstanding')} value={money(report.stats.outstanding)} icon={BadgeAlert} tone="amber" />
                        <StatCard label={t('dailyReport.transactions')} value={report.stats.transactions_count} icon={Receipt} tone="brand" />
                        <StatCard
                            label={t('dailyReport.cashVariance')}
                            value={report.stats.cash_variance === null ? t('dailyReport.noClosureYet') : money(report.stats.cash_variance)}
                            icon={Scale}
                            tone={report.stats.cash_variance === null ? 'neutral' : report.stats.cash_variance < 0 ? 'rose' : 'emerald'}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <SectionCard id="daily-payments-by-method" title={t('dailyReport.paymentsByMethod')}>
                            <SegmentedBar
                                money={money}
                                segments={[
                                    { key: 'espece', label: t('payment.cash'), amount: report.payments_by_method.espece.amount, percent: report.payments_by_method.espece.percent, colorClassName: 'bg-emerald-600 dark:bg-emerald-400' },
                                    { key: 'carte', label: t('payment.card'), amount: report.payments_by_method.carte.amount, percent: report.payments_by_method.carte.percent, colorClassName: 'bg-brand-600 dark:bg-brand-400' },
                                    { key: 'flooz', label: t('payment.flooz'), amount: report.payments_by_method.flooz.amount, percent: report.payments_by_method.flooz.percent, colorClassName: 'bg-accent-500 dark:bg-accent-400' },
                                    { key: 'tmoney', label: t('payment.tmoney'), amount: report.payments_by_method.tmoney.amount, percent: report.payments_by_method.tmoney.percent, colorClassName: 'bg-violet-500 dark:bg-violet-400' },
                                ]}
                            />
                        </SectionCard>

                        <SectionCard id="daily-payments-by-hour" title={t('dailyReport.paymentsByHour')}>
                            {report.payments_by_hour.length === 0 ? (
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('dailyReport.noTransactions')}</p>
                            ) : (
                                <div className="flex items-end gap-1.5" role="img" aria-label={t('dailyReport.paymentsByHour')}>
                                    {report.payments_by_hour.map((point) => {
                                        const pct = Math.round((point.total / maxHour) * 100);
                                        return (
                                            <div key={point.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${point.hour}h — ${money(point.total)}`}>
                                                <div className="flex h-28 w-full items-end overflow-hidden rounded-t-md bg-ink-100 dark:bg-ink-800">
                                                    <div
                                                        className={cx('w-full rounded-t-md bg-brand-600 transition-all dark:bg-brand-400', point.total === 0 && 'bg-transparent dark:bg-transparent')}
                                                        style={{ height: `${Math.max(pct, point.total > 0 ? 4 : 0)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-medium text-ink-500 dark:text-ink-400">{point.hour}h</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3">
                        <StatCard label={t('dailyReport.settledToday')} value={`${report.settled_today.count} · ${money(report.settled_today.amount)}`} icon={ArrowUpCircle} tone="emerald" />
                        <StatCard label={t('dailyReport.unpaidToday')} value={`${report.unpaid_today.count} · ${money(report.unpaid_today.amount)}`} icon={BadgeAlert} tone="amber" />
                        <StatCard
                            label={t('dailyReport.discountsToday')}
                            value={money(report.discounts.total)}
                            icon={BadgePercent}
                            tone="brand"
                            hint={t('dailyReport.discountsHint', { count: report.discounts.count, sensitive: report.discounts.sensitive_count })}
                        />
                    </div>

                    {report.discounts.sensitive_count > 0 && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                            <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                            {t('dailyReport.sensitiveDiscounts', { count: report.discounts.sensitive_count, amount: money(report.discounts.sensitive_total) })}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <SectionCard id="daily-sessions" title={t('dailyReport.sessions')} subtitle={t('dailyReport.sessionsHint')}>
                            {report.sessions.length === 0 ? (
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('dailyReport.noSessions')}</p>
                            ) : (
                                <ul className="divide-y divide-ink-200/80 dark:divide-ink-800">
                                    {report.sessions.map((session) => (
                                        <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                                            <span className="min-w-0">
                                                <span className="font-semibold text-ink-900 dark:text-white">{session.register_label}</span>
                                                <span className="text-ink-600 dark:text-ink-350"> · {session.cashier ?? '—'}</span>
                                                <span className="block text-xs text-ink-500 dark:text-ink-400">
                                                    {time(session.opened_at)}
                                                    {session.closed_at ? ` → ${time(session.closed_at)}` : ''} · {money(session.collected)}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                {session.variance !== null && (
                                                    <span className={cx('text-xs font-semibold tabular-nums', session.variance === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                                                        {money(session.variance)}
                                                    </span>
                                                )}
                                                <Pill tone={session.status === 'open' ? 'emerald' : session.status === 'paused' ? 'amber' : 'neutral'}>{t(`cashSession.status.${session.status}`)}</Pill>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SectionCard>

                        <SectionCard id="daily-reconciliation" title={t('dailyReport.reconciliation')}>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-ink-600 dark:text-ink-350">{t('dailyReport.expected')}</dt>
                                    <dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{report.reconciliation.expected === null ? '—' : money(report.reconciliation.expected)}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-ink-600 dark:text-ink-350">{t('dailyReport.counted')}</dt>
                                    <dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{report.reconciliation.counted === null ? '—' : money(report.reconciliation.counted)}</dd>
                                </div>
                                <div className="flex justify-between gap-3 border-t border-ink-200/80 pt-2 dark:border-ink-800">
                                    <dt className="text-ink-600 dark:text-ink-350">{t('dailyReport.cashVariance')}</dt>
                                    <dd className={cx('font-semibold tabular-nums', report.reconciliation.variance ? 'text-red-700 dark:text-red-300' : 'text-ink-900 dark:text-white')}>
                                        {report.reconciliation.variance === null ? t('dailyReport.noClosureYet') : money(report.reconciliation.variance)}
                                    </dd>
                                </div>
                            </dl>
                            {report.reconciliation.notes && <p className="text-xs text-ink-600 dark:text-ink-350">{report.reconciliation.notes}</p>}
                            {!report.reconciliation.closed && (
                                <p className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                                    <Wallet aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('dailyReport.notClosedHint')}
                                </p>
                            )}
                        </SectionCard>
                    </div>

                    <SectionCard
                        id="daily-movements"
                        title={t('dailyReport.movements')}
                        subtitle={`${t('dailyReport.movementsIn')} ${money(report.movements_summary.in_total)} · ${t('dailyReport.movementsOut')} ${money(report.movements_summary.out_total)}`}
                    >
                        {report.movements.length === 0 ? (
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('dailyReport.noMovements')}</p>
                        ) : (
                            <ul className="divide-y divide-ink-200/80 dark:divide-ink-800">
                                {report.movements.map((movement) => (
                                    <li key={movement.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                        <span className="flex items-center gap-2 text-ink-700 dark:text-ink-200">
                                            {movement.type === 'entree' ? (
                                                <ArrowDownCircle aria-hidden="true" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                            ) : (
                                                <ArrowUpCircle aria-hidden="true" className="h-4 w-4 text-red-500 dark:text-red-400" />
                                            )}
                                            {movement.category ?? '—'}
                                            {movement.creator && <span className="text-ink-500 dark:text-ink-400">· {movement.creator}</span>}
                                        </span>
                                        <span className="tabular-nums text-ink-500 dark:text-ink-400">
                                            {time(movement.occurred_at)} · {money(movement.amount)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>

                    <SectionCard id="daily-cashiers" title={t('dailyReport.cashiers')} flush>
                        {report.cashiers.length === 0 ? (
                            <p className="p-5 text-sm text-ink-600 dark:text-ink-350 sm:p-6">{t('dailyReport.noCashiers')}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[920px] text-left text-sm">
                                    <thead className="border-b border-ink-200/80 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                                        <tr>
                                            <th scope="col" className="px-5 py-3 sm:px-6">{t('dailyReport.cashier')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierAmount')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierCount')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierAverage')}</th>
                                            <th scope="col" className="px-4 py-3">{t('dailyReport.cashierSession')}</th>
                                            {report.cashier_daily_target !== null && <th scope="col" className="px-4 py-3">{t('dailyReport.cashierProductivity')}</th>}
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierVariance')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierVsMonth')}</th>
                                            <th scope="col" className="px-5 py-3 sm:px-6">{t('dailyReport.cashierStatus')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink-200/80 dark:divide-ink-800">
                                        {report.cashiers.map((cashier) => (
                                            <tr key={cashier.user_id}>
                                                <td className="px-5 py-3 font-medium text-ink-900 dark:text-white sm:px-6">
                                                    <span className="flex items-center gap-2">
                                                        <Users aria-hidden="true" className="h-4 w-4 text-ink-400" />
                                                        {cashier.name}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{money(cashier.amount)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{cashier.transactions_count}</td>
                                                <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">{money(cashier.average_basket)}</td>
                                                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                                                    {cashier.session ? (
                                                        <span className="whitespace-nowrap">
                                                            {cashier.session.register_label} · {t(`cashSession.status.${cashier.session.status}`)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-ink-500 dark:text-ink-400">—</span>
                                                    )}
                                                </td>
                                                {report.cashier_daily_target !== null && (
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <ProgressBar value={cashier.amount} max={report.cashier_daily_target} className="w-24" />
                                                            <span className="text-xs tabular-nums text-ink-600 dark:text-ink-350">
                                                                {Math.round((cashier.amount / report.cashier_daily_target) * 100)} %
                                                            </span>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-right tabular-nums">
                                                    {cashier.variance === null ? (
                                                        <span className="text-ink-500 dark:text-ink-400">—</span>
                                                    ) : (
                                                        <span className={cashier.variance === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>
                                                            {money(cashier.variance)}
                                                            {cashier.errors > 0 && <span className="block text-xs">{t('dailyReport.cashierErrors', { count: cashier.errors })}</span>}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums text-ink-700 dark:text-ink-200">
                                                    {cashier.previous_month_daily_average === null ? '—' : (() => {
                                                        const change = percentChange(cashier.amount, cashier.previous_month_daily_average);
                                                        return change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} %`;
                                                    })()}
                                                </td>
                                                <td className="px-5 py-3 sm:px-6">
                                                    {cashier.status === 'verifie' ? (
                                                        <Pill tone="emerald">{t('dailyReport.statusVerified')}</Pill>
                                                    ) : cashier.status === 'en_attente' ? (
                                                        <Pill tone="amber">{t('dailyReport.statusPending')}</Pill>
                                                    ) : (
                                                        <span className="text-ink-500 dark:text-ink-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>
                </>
            )}
        </div>
    );
}
