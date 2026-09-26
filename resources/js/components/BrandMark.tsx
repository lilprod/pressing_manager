import { useId } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { cx } from './ui/styles';

/** Pictogramme de marque : un cintre stylisé dans un carré arrondi. */
export function BrandLogo({ className }: { className?: string }) {
    // Identifiant unique par instance : un dégradé défini dans un parent masqué (display:none) ne serait pas rendu ailleurs.
    const gradientId = `pm-logo-${useId().replace(/:/g, '')}`;
    return (
        <svg viewBox="0 0 32 32" aria-hidden="true" className={cx('shrink-0', className ?? 'h-9 w-9')}>
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1497ad" />
                    <stop offset="100%" stopColor="#106276" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
            <circle cx="25" cy="7.5" r="1.6" fill="#fdbc71" />
            <path
                d="M16 11a2.5 2.5 0 1 1 2.5 2.5c-1 0-2.5.6-2.5 2v.6l8.6 5.2c1 .6.6 2.2-.6 2.2H8c-1.2 0-1.6-1.6-.6-2.2L16 16.1"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** Logo + nom de l'application. */
export default function BrandMark({ inverted = false, collapse = false, className }: { inverted?: boolean; collapse?: boolean; className?: string }) {
    const { t } = useI18n();
    return (
        <span className={cx('inline-flex items-center gap-2.5', className)}>
            <BrandLogo />
            <span className={cx('flex-col leading-none', collapse ? 'hidden sm:flex' : 'flex')}>
                <span className={cx('font-display text-[15px] font-extrabold', inverted ? 'text-white' : 'text-ink-900 dark:text-white')}>
                    {t('app.title')}
                </span>
                <span className={cx('mt-1 text-[11px] font-medium', inverted ? 'text-brand-100' : 'text-ink-600 dark:text-ink-350')}>
                    {t('app.tagline')}
                </span>
            </span>
        </span>
    );
}
