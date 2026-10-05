import type { CashFlowPoint } from '../../types';
import { cx } from './styles';

/**
 * Histogramme à deux séries (entrées/sorties) — « Flux de caisse » (écran Centre de
 * caisse, Figma). Même technique CSS pure que RevenueBars.tsx (pas de dépendance de
 * graphique dans ce projet) : deux barres par jour, hauteur proportionnelle au
 * maximum de la série, plancher de 4% pour rester visible quand non nul.
 */
export default function CashFlowBars({
    series,
    money,
    dateShort,
    className,
}: {
    series: CashFlowPoint[];
    money: (amount: number) => string;
    dateShort: (value: string) => string;
    className?: string;
}) {
    const max = Math.max(1, ...series.map((p) => Math.max(p.in, p.out)));

    return (
        <div className={cx('flex items-end gap-1.5', className)} role="img" aria-label="Flux de caisse quotidien">
            {series.map((point) => {
                const inPct = Math.round((point.in / max) * 100);
                const outPct = Math.round((point.out / max) * 100);
                return (
                    <div
                        key={point.date}
                        className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                        title={`${dateShort(point.date)} — Entrées ${money(point.in)} · Sorties ${money(point.out)}`}
                    >
                        <div className="flex h-28 w-full items-end justify-center gap-0.5 overflow-hidden">
                            <div
                                className={cx('w-1/2 rounded-t-sm bg-emerald-600 transition-all dark:bg-emerald-400', point.in === 0 && 'bg-transparent dark:bg-transparent')}
                                style={{ height: `${Math.max(inPct, point.in > 0 ? 4 : 0)}%` }}
                            />
                            <div
                                className={cx('w-1/2 rounded-t-sm bg-red-500 transition-all dark:bg-red-400', point.out === 0 && 'bg-transparent dark:bg-transparent')}
                                style={{ height: `${Math.max(outPct, point.out > 0 ? 4 : 0)}%` }}
                            />
                        </div>
                        <span className="truncate text-[10px] font-medium text-ink-500 dark:text-ink-400">{dateShort(point.date)}</span>
                    </div>
                );
            })}
        </div>
    );
}
