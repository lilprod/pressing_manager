import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { cx } from './styles';

/* Indicateur de chargement ------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
    return <LoaderCircle aria-hidden="true" className={cx('animate-spin', className ?? 'h-5 w-5')} />;
}

export function LoadingState({ label, className }: { label?: string; className?: string }) {
    const { t } = useI18n();
    return (
        <div role="status" className={cx('flex flex-col items-center justify-center gap-3 py-16 text-ink-600 dark:text-ink-350', className)}>
            <Spinner className="h-7 w-7 text-brand-600 dark:text-brand-300" />
            <span className="text-sm font-medium">{label ?? t('common.loading')}</span>
        </div>
    );
}

/* État vide ---------------------------------------------------------------- */

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    compact?: boolean;
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, compact = false, className }: EmptyStateProps) {
    return (
        <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14', className)}>
            <span
                className={cx(
                    'flex items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20',
                    compact ? 'h-11 w-11' : 'h-14 w-14',
                )}
            >
                <Icon aria-hidden="true" className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={1.75} />
            </span>
            <div className="space-y-1">
                <p className="font-display font-semibold text-ink-900 dark:text-ink-50">{title}</p>
                {description && <p className="mx-auto max-w-xs text-sm text-ink-600 dark:text-ink-350">{description}</p>}
            </div>
            {action}
        </div>
    );
}

/* Messages ----------------------------------------------------------------- */

type AlertTone = 'success' | 'error' | 'warning' | 'info';

const ALERT_STYLES: Record<AlertTone, { box: string; icon: LucideIcon }> = {
    success: {
        box: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
        icon: CircleCheck,
    },
    error: {
        box: 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300',
        icon: CircleAlert,
    },
    warning: {
        box: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
        icon: TriangleAlert,
    },
    info: {
        box: 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300',
        icon: Info,
    },
};

export function Alert({ tone, children, className, icon }: { tone: AlertTone; children: ReactNode; className?: string; icon?: LucideIcon }) {
    const style = ALERT_STYLES[tone];
    const Icon = icon ?? style.icon;
    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            className={cx('flex animate-fade-in items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium', style.box, className)}
        >
            <Icon aria-hidden="true" className="mt-px h-[18px] w-[18px] shrink-0" />
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}
