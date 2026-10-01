import type { RevenueSeriesPoint } from '../../types';
import { cx } from './styles';

/** Histogramme simple (barres CSS, sans dépendance) du CA quotidien — réutilisé par la vue
 * consolidée multi-agences et son détail par agence. */
export default function RevenueBars({
    series,
    money,
    dateShort,
    className,
}: {
    series: RevenueSeriesPoint[];
    money: (amount: number) => string;
    dateShort: (value: string) => string;
    className?: string;
}) {
    const max = Math.max(1, ...series.map((p) => p.revenue));

    return (
        <div className={cx('flex items-end gap-1.5', className)} role="img" aria-label="Évolution du chiffre d'affaires">
            {series.map((point) => {
                const pct = Math.round((point.revenue / max) * 100);
                return (
                    <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${dateShort(point.date)} — ${money(point.revenue)}`}>
                        <div className="flex h-28 w-full items-end overflow-hidden rounded-t-md bg-ink-100 dark:bg-ink-800">
                            <div
                                className={cx('w-full rounded-t-md bg-brand-600 transition-all dark:bg-brand-400', point.revenue === 0 && 'bg-transparent dark:bg-transparent')}
                                style={{ height: `${Math.max(pct, point.revenue > 0 ? 4 : 0)}%` }}
                            />
                        </div>
                        <span className="truncate text-[10px] font-medium text-ink-500 dark:text-ink-400">{dateShort(point.date)}</span>
                    </div>
                );
            })}
        </div>
    );
}
