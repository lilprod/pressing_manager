import { useLocation } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { resolveBreadcrumb } from '../lib/breadcrumbs';

/** Fil d'Ariane (en-tête) — voir `lib/breadcrumbs.ts` pour la table de routage. */
export default function Breadcrumb() {
    const { t } = useI18n();
    const { settings } = useSettings();
    const location = useLocation();
    const entry = resolveBreadcrumb(location.pathname);

    return (
        <nav aria-label={t('a11y.breadcrumb')} className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
            <span className="shrink-0 font-semibold text-ink-900 dark:text-ink-50">{settings?.pressing_name}</span>
            {entry && (
                <>
                    {entry.section && (
                        <>
                            <span aria-hidden="true" className="text-ink-400 dark:text-ink-600">
                                /
                            </span>
                            <span className="shrink-0 text-ink-600 dark:text-ink-350">{t(entry.section)}</span>
                        </>
                    )}
                    <span aria-hidden="true" className="text-ink-400 dark:text-ink-600">
                        /
                    </span>
                    <span className="truncate text-ink-600 dark:text-ink-350">{t(entry.page)}</span>
                </>
            )}
        </nav>
    );
}
