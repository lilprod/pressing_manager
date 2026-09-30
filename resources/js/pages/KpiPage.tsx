import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, LoadingState } from '../components/ui/Feedback';
import { button, card, cardPadded, cx, input, label, sectionTitle } from '../components/ui/styles';
import {
    BadgePercent,
    Boxes,
    CalendarClock,
    CircleDollarSign,
    Clock,
    Crown,
    FileDown,
    FileSpreadsheet,
    Hourglass,
    PackageCheck,
    ShoppingBag,
    TrendingUp,
    Truck,
    TriangleAlert,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { KpiData } from '../types';

function toDateInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export default function KpiPage() {
    const { activeAgencyId } = useAuth();
    const { t } = useI18n();
    const { money, date } = useFormat();

    const [from, setFrom] = useState(() => toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const [to, setTo] = useState(() => toDateInputValue(new Date()));
    const [data, setData] = useState<KpiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
    const [error, setError] = useState<string | null>(null);

    function buildQuery() {
        const params = new URLSearchParams({ from, to });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        return params.toString();
    }

    useEffect(() => {
        setLoading(true);
        setError(null);
        api
            .get<KpiData>(`/kpi?${buildQuery()}`)
            .then(setData)
            .catch((err) => setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAgencyId, from, to]);

    async function exportFile(kind: 'pdf' | 'excel') {
        setExporting(kind);
        setError(null);
        try {
            const blob = await api.blob(`/kpi/export/${kind}?${buildQuery()}`);
            downloadBlob(blob, `kpi-${from}-${to}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('kpi.exportError'));
        } finally {
            setExporting(null);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('kpi.title')}
                subtitle={t('kpi.subtitle')}
                icon={TrendingUp}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('pdf')} className={button('secondary', 'md')}>
                            <FileDown aria-hidden="true" className="h-4 w-4" />
                            {exporting === 'pdf' ? t('kpi.exporting') : t('kpi.exportPdf')}
                        </button>
                        <button type="button" disabled={exporting !== null} onClick={() => void exportFile('excel')} className={button('secondary', 'md')}>
                            <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                            {exporting === 'excel' ? t('kpi.exporting') : t('kpi.exportExcel')}
                        </button>
                    </div>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}

            <div className={cx(cardPadded, 'flex flex-wrap items-end gap-4')}>
                <label className="block">
                    <span className={label}>{t('kpi.from')}</span>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>{t('kpi.to')}</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
                </label>
                <p className="ml-auto flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                    <CalendarClock aria-hidden="true" className="h-4 w-4" />
                    {data?.scope === 'agency' ? data.agency?.name ?? '—' : t('kpi.scopeConsolidated')}
                </p>
            </div>

            {loading || !data ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                        <Tile icon={CircleDollarSign} label={t('kpi.revenue')} value={money(data.revenue)} tone="brand" />
                        <Tile icon={ShoppingBag} label={t('kpi.ordersCount')} value={String(data.orders_count)} tone="sky" />
                        <Tile icon={CircleDollarSign} label={t('kpi.averageOrderValue')} value={money(data.average_order_value)} tone="violet" />
                        <Tile icon={BadgePercent} label={t('kpi.expressRate')} value={`${data.express_rate}%`} tone="amber" />
                        <Tile icon={TriangleAlert} label={t('kpi.lowStockItems')} value={String(data.low_stock_items)} tone="rose" />
                        <Tile icon={Boxes} label={t('kpi.stockMovements')} value={String(data.stock_movements)} tone="neutral" />
                        <Tile icon={Truck} label={t('kpi.deliveriesCompleted')} value={String(data.deliveries_completed)} tone="emerald" />
                        <Tile icon={PackageCheck} label={t('kpi.deliveryCompletionRate')} value={`${data.delivery_completion_rate}%`} tone="emerald" />
                        <Tile icon={Hourglass} label={t('kpi.hoursWorked')} value={String(data.hours_worked)} tone="sky" />
                        <Tile icon={Crown} label={t('kpi.activeSubscriptions')} value={String(data.active_subscriptions)} tone="accent" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Tile icon={Clock} label={t('kpi.attendancePresent')} value={String(data.attendance_present)} tone="emerald" />
                        <Tile icon={Clock} label={t('kpi.attendanceRetard')} value={String(data.attendance_retard)} tone="amber" />
                        <Tile icon={Clock} label={t('kpi.attendanceAbsent')} value={String(data.attendance_absent)} tone="rose" />
                    </div>

                    {data.by_agency && <ByAgencyTable rows={data.by_agency} money={money} />}

                    <p className="text-xs text-ink-500 dark:text-ink-400">
                        {t('kpi.from')} {date(data.from)} — {t('kpi.to')} {date(data.to)}
                    </p>
                </>
            )}
        </div>
    );
}

const TILE_TONES: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
    rose: 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    neutral: 'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-ink-400/10 dark:text-ink-300 dark:ring-ink-400/20',
    accent: 'bg-accent-100 text-accent-800 ring-accent-200 dark:bg-accent-400/15 dark:text-accent-300 dark:ring-accent-400/25',
};

function Tile({ icon: Icon, label: title, value, tone }: { icon: LucideIcon; label: string; value: string; tone: keyof typeof TILE_TONES }) {
    return (
        <div className={cx(card, 'flex items-start gap-3 p-4')}>
            <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TILE_TONES[tone])}>
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink-600 dark:text-ink-350">{title}</p>
                <p className="font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
}

function ByAgencyTable({
    rows,
    money,
}: {
    rows: NonNullable<KpiData['by_agency']>;
    money: (amount: number | null | undefined) => string;
}) {
    const { t } = useI18n();

    return (
        <section aria-labelledby="by-agency-heading" className={cx(card, 'overflow-hidden')}>
            <h2 id="by-agency-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                <Users aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('kpi.byAgency')}
            </h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                        <tr>
                            <th scope="col" className="px-5 py-2.5 font-semibold">{t('kpi.agency')}</th>
                            <th scope="col" className="px-5 py-2.5 font-semibold">{t('kpi.revenue')}</th>
                            <th scope="col" className="px-5 py-2.5 font-semibold">{t('kpi.ordersCount')}</th>
                            <th scope="col" className="px-5 py-2.5 font-semibold">{t('kpi.lowStockItems')}</th>
                            <th scope="col" className="px-5 py-2.5 font-semibold">{t('kpi.deliveriesCompleted')}</th>
                            <th scope="col" className="px-5 py-2.5 font-semibold">{t('kpi.attendanceAbsent')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                        {rows.map((row) => (
                            <tr key={row.agency_id}>
                                <td className="px-5 py-2.5 font-medium text-ink-900 dark:text-ink-50">{row.agency_name}</td>
                                <td className="px-5 py-2.5 tabular-nums">{money(row.revenue)}</td>
                                <td className="px-5 py-2.5 tabular-nums">{row.orders_count}</td>
                                <td className="px-5 py-2.5 tabular-nums">{row.low_stock_items}</td>
                                <td className="px-5 py-2.5 tabular-nums">{row.deliveries_completed}</td>
                                <td className="px-5 py-2.5 tabular-nums">{row.attendance_absent}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
