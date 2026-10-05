import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, BadgeAlert, BadgePercent, Banknote, CalendarDays, FileSpreadsheet, Receipt, Scale, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { StatCard, SectionCard } from '../../components/ui/Metrics';
import SegmentedBar from '../../components/ui/SegmentedBar';
import { button, cx, input } from '../../components/ui/styles';
import type { DailyReport } from '../../types';

/* « Bilan journalier et performance caissiers » (Figma SPARK PRESSING, section 08,
 * node 43:1144) — écran jusqu'ici non construit, voir CLAUDE.md. Toujours à une seule
 * agence (comme le Centre de caisse) : un bilan de caisse raisonne par caisse physique,
 * jamais une vue consolidée multi-agences. */

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
    const { money, time } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [date, setDate] = useState(today());
    const [report, setReport] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

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

    async function exportExcel() {
        if (!agencyId) return;
        setExporting(true);
        try {
            const query = new URLSearchParams({ agency_id: String(agencyId), date });
            const blob = await api.blob(`/reports/daily/export/excel?${query}`);
            downloadBlob(blob, `bilan-journalier-${date}.xlsx`);
        } finally {
            setExporting(false);
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
                        <button type="button" disabled={exporting} onClick={() => void exportExcel()} className={button('secondary', 'md', 'h-10')}>
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
                        <StatCard label={t('dailyReport.revenue')} value={money(report.stats.revenue_today)} icon={Banknote} tone="emerald" />
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
                        <StatCard label={t('dailyReport.discountsToday')} value={money(report.discounts_today)} icon={BadgePercent} tone="brand" />
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
                                <table className="w-full min-w-[640px] text-left text-sm">
                                    <thead className="border-b border-ink-200/80 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                                        <tr>
                                            <th scope="col" className="px-5 py-3 sm:px-6">{t('dailyReport.cashier')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierAmount')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierCount')}</th>
                                            <th scope="col" className="px-4 py-3 text-right">{t('dailyReport.cashierAverage')}</th>
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
