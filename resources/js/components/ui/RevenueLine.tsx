import { useState } from 'react';
import type { RevenueSeriesPoint } from '../../types';
import { cx } from './styles';

/**
 * Courbe simple du chiffre d'affaires (SVG inline, aucune dépendance de graphique —
 * même principe que RevenueBars.tsx). Points cliquables/survolables : la valeur du
 * point actif s'affiche dans une info-bulle, comme sur la maquette « Revenus du réseau ».
 */
export default function RevenueLine({
    series,
    money,
    label,
    className,
}: {
    series: RevenueSeriesPoint[];
    money: (amount: number) => string;
    label: (date: string) => string;
    className?: string;
}) {
    const [active, setActive] = useState<number | null>(null);
    const width = 600;
    const height = 200;
    const padX = 8;
    const padY = 16;
    const peak = Math.max(0, ...series.map((p) => p.revenue));
    const max = Math.max(1, peak);
    const step = series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0;
    const points = series.map((p, i) => ({
        x: padX + i * step,
        y: height - padY - (p.revenue / max) * (height - padY * 2),
    }));
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = points.length > 0 ? `${path} L${points[points.length - 1].x.toFixed(1)},${height - padY} L${points[0].x.toFixed(1)},${height - padY} Z` : '';
    const shown = active ?? (series.length > 0 ? series.length - 1 : null);
    const ticks = [1, 0.5, 0];

    return (
        <div className={cx('space-y-2', className)}>
            <div className="relative">
                <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full" preserveAspectRatio="none" role="img" aria-label="Évolution du chiffre d'affaires">
                    {ticks.map((ratio) => {
                        const y = height - padY - ratio * (height - padY * 2);
                        return <line key={ratio} x1={0} x2={width} y1={y} y2={y} className="stroke-ink-200 dark:stroke-ink-800" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                    })}
                    {area && <path d={area} className="fill-emerald-500/10" />}
                    {path && <path d={path} fill="none" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
                </svg>
                {points.map((p, i) => (
                    <button
                        key={series[i].date}
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onClick={() => setActive(i)}
                        aria-label={`${label(series[i].date)} — ${money(series[i].revenue)}`}
                        className={cx(
                            'absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-600 bg-white dark:border-emerald-400 dark:bg-ink-900',
                            shown === i && 'h-3.5 w-3.5 bg-emerald-600 dark:bg-emerald-400',
                        )}
                        style={{ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` }}
                    />
                ))}
                {shown !== null && points[shown] && (
                    <div
                        className="pointer-events-none absolute -translate-y-full rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-ink-700"
                        style={{
                            left: `${Math.min(80, Math.max(0, (points[shown].x / width) * 100 - 10))}%`,
                            top: `calc(${(points[shown].y / height) * 100}% - 10px)`,
                        }}
                    >
                        <p className="font-bold tabular-nums">{money(series[shown].revenue)}</p>
                        <p className="text-white/70">{label(series[shown].date)}</p>
                    </div>
                )}
                <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between py-2 text-[10px] text-ink-500 dark:text-ink-400">
                    <span>{money(peak)}</span>
                    <span>{money(Math.round(peak / 2))}</span>
                    <span>0</span>
                </div>
            </div>
            <div className="flex justify-between gap-1 text-[10px] font-medium text-ink-500 dark:text-ink-400">
                {series.map((p) => (
                    <span key={p.date} className="min-w-0 truncate">
                        {label(p.date)}
                    </span>
                ))}
            </div>
        </div>
    );
}
