import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './styles';

interface Props {
    title: ReactNode;
    subtitle?: ReactNode;
    icon?: LucideIcon;
    actions?: ReactNode;
    className?: string;
    titleId?: string;
}

export default function PageHeader({ title, subtitle, icon: Icon, actions, className, titleId }: Props) {
    return (
        <header className={cx('flex flex-wrap items-center justify-between gap-4', className)}>
            <div className="flex min-w-0 items-center gap-3.5">
                {Icon && (
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand sm:flex dark:from-brand-400 dark:to-brand-600 dark:shadow-none">
                        <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                )}
                <div className="min-w-0">
                    <h1 id={titleId} className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">
                        {title}
                    </h1>
                    {subtitle && <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}

export function Avatar({
    firstName,
    lastName,
    photoUrl,
    size = 'md',
    className,
}: {
    firstName?: string;
    lastName?: string;
    photoUrl?: string | null;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}) {
    const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
    const sizeClasses = cx(
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-14 w-14 text-lg',
    );

    if (photoUrl) {
        return (
            <img
                src={photoUrl}
                alt=""
                aria-hidden="true"
                className={cx('shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-ink-900', sizeClasses, className)}
            />
        );
    }

    return (
        <span
            aria-hidden="true"
            className={cx(
                'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 font-display font-bold text-brand-800 ring-2 ring-white',
                'dark:from-brand-400/25 dark:to-brand-400/10 dark:text-brand-200 dark:ring-ink-900',
                sizeClasses,
                className,
            )}
        >
            {initials}
        </span>
    );
}
