/**
 * Jetons de style partagés (chaînes de classes Tailwind). Centraliser ces chaînes
 * garantit la cohérence visuelle (rayons, hauteurs, états hover/focus/disabled)
 * sans introduire de bibliothèque de composants.
 */

export function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}

/* Surfaces ----------------------------------------------------------------- */

export const card =
    'rounded-2xl border border-ink-200/80 bg-white shadow-card dark:border-ink-800 dark:bg-ink-900 dark:shadow-inner-top';

export const cardPadded = cx(card, 'p-5 sm:p-6');

export const cardInteractive = cx(
    card,
    'transition duration-150 hover:-translate-y-px hover:border-ink-300 hover:shadow-card-hover dark:hover:border-ink-700',
);

export const sectionTitle = 'font-display text-base font-bold text-ink-900 dark:text-ink-50';

export const muted = 'text-ink-600 dark:text-ink-350';

export const eyebrow = 'text-xs font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350';

/* Champs de formulaire ----------------------------------------------------- */

const fieldBase =
    'block w-full rounded-xl border border-ink-400 bg-white text-ink-900 shadow-sm transition duration-150 placeholder:text-ink-500 ' +
    'hover:border-ink-500 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/15 ' +
    'disabled:cursor-not-allowed disabled:opacity-60 ' +
    'dark:border-ink-500 dark:bg-ink-950 dark:text-ink-50 dark:placeholder:text-ink-400 dark:hover:border-ink-400 dark:focus:border-brand-300 dark:focus:ring-brand-400/20';

export const input = cx(fieldBase, 'h-11 px-3.5 text-[15px]');

export const inputLg = cx(fieldBase, 'h-12 px-4 text-base');

export const inputSm = cx(fieldBase, 'h-9 px-3 text-sm');

export const select = cx(fieldBase, 'h-11 px-3 text-[15px]');

export const label = 'mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200';

/* Boutons ------------------------------------------------------------------ */

const buttonBase =
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition duration-150 ' +
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

const buttonSizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-4 text-sm',
    lg: 'h-14 px-6 text-base',
} as const;

const buttonVariants = {
    primary:
        'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-brand dark:bg-brand-400 dark:text-ink-950 dark:hover:bg-brand-300 dark:hover:shadow-none',
    secondary:
        'border border-ink-200 bg-white text-ink-800 shadow-sm hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100 dark:hover:border-ink-600 dark:hover:bg-ink-700',
    ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-200 dark:hover:bg-ink-800 dark:hover:text-white',
    success: 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 dark:bg-emerald-400 dark:text-ink-950 dark:hover:bg-emerald-300',
    accent: 'bg-accent-500 text-ink-950 shadow-sm hover:bg-accent-600 dark:bg-accent-400 dark:text-ink-950 dark:hover:bg-accent-300',
    danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 dark:bg-red-400 dark:text-ink-950 dark:hover:bg-red-300',
    dangerGhost: 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10',
    link: 'h-auto px-0 text-brand-700 underline-offset-4 hover:underline dark:text-brand-300',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function button(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string): string {
    return cx(buttonBase, variant === 'link' ? '' : buttonSizes[size], buttonVariants[variant], extra);
}

export const iconButton =
    'inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-600 transition duration-150 hover:bg-ink-100 hover:text-ink-900 active:scale-95 ' +
    'dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white';

export const textLink = 'font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300';
