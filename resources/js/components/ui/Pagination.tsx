import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { button, cx } from './styles';
import type { Paginated } from '../../types';

interface PaginationProps {
    meta: Pick<Paginated<unknown>, 'current_page' | 'last_page' | 'total'>;
    onPageChange: (page: number) => void;
    className?: string;
}

/** Barre de pagination réutilisable (précédent/suivant + résumé), pilotée par la
 * réponse paginée standard de l'API (`current_page`/`last_page`/`total`). */
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
