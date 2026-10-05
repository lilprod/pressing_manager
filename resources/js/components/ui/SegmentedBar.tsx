import { cx } from './styles';

export interface SegmentedBarSegment {
    key: string;
    label: string;
    amount: number;
    percent: number;
    colorClassName: string;
}

/**
 * Barre segmentée horizontale (CSS pur, aucune dépendance) — « Ventilation des
 * encaissements » (écran Centre de caisse, Figma). Chaque segment a une largeur
 * proportionnelle à son pourcentage réel (calculé côté backend, voir
 * CashService::paymentBreakdown()) ; une légende avec montant + % l'accompagne.
 */
export default function SegmentedBar({
    segments,
    money,
    className,
}: {
    segments: SegmentedBarSegment[];
    money: (amount: number) => string;
    className?: string;
}) {
    const total = segments.reduce((sum, s) => sum + s.amount, 0);

    return (
        <div className={cx('space-y-3', className)}>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" role="img" aria-label="Ventilation des encaissements">
                {total > 0 ? (
                    segments
                        .filter((s) => s.amount > 0)
                        .map((segment) => (
                            <div
                                key={segment.key}
                                className={segment.colorClassName}
                                style={{ width: `${segment.percent}%` }}
                                title={`${segment.label} — ${money(segment.amount)} (${segment.percent}%)`}
                            />
                        ))
                ) : (
                    <div className="w-full bg-ink-200 dark:bg-ink-700" />
                )}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {segments.map((segment) => (
                    <li key={segment.key} className="flex items-center gap-2">
                        <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0 rounded-full', segment.colorClassName)} />
                        <span className="font-medium text-ink-800 dark:text-ink-100">{segment.label}</span>
                        <span className="tabular-nums text-ink-500 dark:text-ink-400">
                            {money(segment.amount)} · {segment.percent}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
