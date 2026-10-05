import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { button, cx } from './styles';
import type { Paginated } from '../../types';

interface PaginationProps {
    meta: Pick<Paginated<unknown>, 'current_page' | 'last_page' | 'total'>;
    onPageChange: (page: number) => void;
    className?: string;
}

/** Pages visibles autour de la page courante, avec « … » pour les trous — toujours
 * la première et la dernière page, jamais plus de 7 éléments au total. */
function visiblePages(current: number, last: number): Array<number | 'ellipsis'> {
    if (last <= 7) {
        return Array.from({ length: last }, (_, i) => i + 1);
    }
    const pages = new Set<number>([1, last, current]);
    if (current > 1) pages.add(current - 1);
    if (current < last) pages.add(current + 1);

    const sorted = Array.from(pages).sort((a, b) => a - b);
    const result: Array<number | 'ellipsis'> = [];
    sorted.forEach((page, i) => {
        if (i > 0 && page - sorted[i - 1] > 1) {
            result.push('ellipsis');
        }
        result.push(page);
    });
    return result;
}

/** Barre de pagination réutilisable (précédent/suivant + pages numérotées + résumé),
 * pilotée par la réponse paginée standard de l'API (`current_page`/`last_page`/`total`). */
export default function Pagination({ meta, onPageChange, className }: PaginationProps) {
    const { t } = useI18n();

    if (meta.last_page <= 1) return null;

    return (
        <nav
            aria-label={t('pagination.label')}
            className={cx('flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/80 px-4 py-3 dark:border-ink-800 sm:px-5', className)}
        >
            <p className="text-xs text-ink-600 dark:text-ink-350">
                {t('pagination.summary', { page: meta.current_page, lastPage: meta.last_page, total: meta.total })}
            </p>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onPageChange(meta.current_page - 1)}
                    disabled={meta.current_page <= 1}
                    className={button('secondary', 'sm')}
                >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    {t('pagination.previous')}
                </button>
                <div className="hidden items-center gap-1 sm:flex">
                    {visiblePages(meta.current_page, meta.last_page).map((page, i) =>
                        page === 'ellipsis' ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-sm text-ink-400 dark:text-ink-500" aria-hidden="true">
                                …
                            </span>
                        ) : (
                            <button
                                key={page}
                                type="button"
                                aria-current={page === meta.current_page ? 'page' : undefined}
                                onClick={() => onPageChange(page)}
                                className={cx(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition',
                                    page === meta.current_page
                                        ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-400 dark:text-ink-950'
                                        : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
                                )}
                            >
                                {page}
                            </button>
                        ),
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => onPageChange(meta.current_page + 1)}
                    disabled={meta.current_page >= meta.last_page}
                    className={button('secondary', 'sm')}
                >
                    {t('pagination.next')}
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>
        </nav>
    );
}
