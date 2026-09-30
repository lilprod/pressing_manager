import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { TONES, type Tone } from './StatusBadge';
import { card, cx, sectionTitle } from './styles';

/* Briques d'affichage des écrans de pilotage (Figma SPARK PRESSING : « Indicateur clé »,
 * « En-tête de section » avec action, barres de progression). Purement présentationnelles :
 * elles n'affichent que les valeurs qu'on leur passe. */

/** Variation relative en % entre deux périodes ; null si la période de référence est vide (pas de base de comparaison). */
export function percentChange(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Props delta/hint d'une StatCard : rien du tout quand il n'y a pas de base de comparaison
 * (évite d'afficher « vs période précédente » sans valeur). */
export function trend(value: number | null, hint: string, options: { unit?: string; positiveIsGood?: boolean } = {}) {
    if (value === null || Number.isNaN(value)) return {};
    return { delta: <DeltaBadge value={value} {...options} />, hint };
}

export function DeltaBadge({ value, unit = '%', positiveIsGood = true }: { value: number | null; unit?: string; positiveIsGood?: boolean }) {
    const { lang } = useI18n();
    if (value === null || Number.isNaN(value)) return null;
    const up = value > 0;
    const flat = value === 0;
    const good = flat ? null : up === positiveIsGood;
    const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
    const formatted = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value);
    return (
        <span
            className={cx(
                'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
                TONES[good === null ? 'neutral' : good ? 'emerald' : 'rose'],
            )}
        >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.25} />
            {formatted}
            {unit}
        </span>
    );
}

export function StatCard({
    label,
    value,
    icon: Icon,
    tone = 'brand',
    delta,
    hint,
    className,
}: {
    label: string;
    value: ReactNode;
    icon: LucideIcon;
    tone?: Tone;
    delta?: ReactNode;
    hint?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cx(card, 'flex min-w-0 flex-col gap-3 p-5', className)}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-ink-600 dark:text-ink-350">{label}</p>
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TONES[tone])}>
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
            </div>
            <p className="truncate font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{value}</p>
            {(delta || hint) && (
                <div className="flex min-h-[22px] flex-wrap items-center gap-2">
                    {delta}
                    {hint && <span className="text-xs text-ink-600 dark:text-ink-350">{hint}</span>}
                </div>
            )}
        </div>
    );
}

export function SectionCard({
    id,
    title,
    subtitle,
    action,
    headerExtra,
    children,
    className,
    flush = false,
}: {
    id: string;
    title: ReactNode;
    subtitle?: ReactNode;
    action?: { to: string; label: string };
    headerExtra?: ReactNode;
    children: ReactNode;
    className?: string;
    /** Contenu collé aux bords (tableaux) : pas de marge interne autour des enfants. */
    flush?: boolean;
}) {
    return (
        <section aria-labelledby={id} className={cx(card, 'flex min-w-0 flex-col', flush ? 'overflow-hidden' : 'gap-4 p-5 sm:p-6', className)}>
            <div className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', flush && 'px-5 pb-3 pt-5 sm:px-6 sm:pt-6')}>
                <div className="min-w-0">
                    <h2 id={id} className={sectionTitle}>
                        {title}
                    </h2>
                    {subtitle && <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{subtitle}</p>}
                </div>
                {headerExtra}
                {action && (
                    <Link
                        to={action.to}
                        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
                    >
                        {action.label}
                        <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                )}
            </div>
            {children}
        </section>
    );
}

export function ProgressBar({ value, max, className, barClassName }: { value: number; max: number; className?: string; barClassName?: string }) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return (
        <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800', className)} aria-hidden="true">
            <div className={cx('h-full rounded-full bg-brand-600 dark:bg-brand-400', barClassName)} style={{ width: `${pct}%` }} />
        </div>
    );
}

/** Pastilles de raccourci de période (Figma : « Raccourci ») — boutons à bascule. */
export function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cx(
                'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition duration-150 active:scale-95',
                active
                    ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-950'
                    : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
            )}
        >
            {children}
        </button>
    );
}
