import type { ReactNode } from 'react';
import { cx } from './styles';

/** Interrupteur (Figma « Bascule » / « Interrupteur ») : case à cocher native masquée, libellé + description optionnelle. */
export default function Toggle({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    className,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <label className={cx('relative flex items-center justify-between gap-4', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}>
            <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">{label}</span>
                {description && <span className="mt-0.5 block text-xs text-ink-600 dark:text-ink-350">{description}</span>}
            </span>
            <span className="relative inline-flex shrink-0 items-center">
                <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
                <span
                    aria-hidden="true"
                    className={cx(
                        'relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/25',
                        checked ? 'bg-brand-600 dark:bg-brand-400' : 'bg-ink-400 dark:bg-ink-500',
                    )}
                >
                    <span className={cx('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
                </span>
            </span>
        </label>
    );
}
