import { useFormat } from '../../lib/format';
import { cx } from './styles';

export interface TimelineEntry {
    id: string | number;
    label: string;
    detail?: string;
    at: string;
    actor?: string | null;
}

/** Chronologie verticale à puces (réutilisée pour la chronologie atelier et le journal d'audit d'un dépôt). */
export function Timeline({ entries, emptyLabel }: { entries: TimelineEntry[]; emptyLabel: string }) {
    const { dateTime } = useFormat();

    if (entries.length === 0) {
        return <p className="text-sm text-ink-500 dark:text-ink-400">{emptyLabel}</p>;
    }

    return (
        <ol className="space-y-0">
            {entries.map((entry, index) => (
                <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                        <span
                            aria-hidden="true"
                            className={cx(
                                'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                                index === 0 ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-ink-300 dark:bg-ink-600',
                            )}
                        />
                        {index < entries.length - 1 && <span aria-hidden="true" className="w-px flex-1 bg-ink-200 dark:bg-ink-700" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900 dark:text-white">{entry.label}</p>
                        {entry.detail && <p className="text-xs text-ink-500 dark:text-ink-400">{entry.detail}</p>}
                        <p className="mt-0.5 text-xs text-ink-400 dark:text-ink-500">
                            {dateTime(entry.at)}
                            {entry.actor ? ` · ${entry.actor}` : ''}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
