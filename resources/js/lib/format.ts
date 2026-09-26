import { useCallback } from 'react';
import { useI18n } from '../contexts/I18nContext';

/**
 * Formatage d'affichage uniquement (séparateurs de milliers, dates localisées).
 * Les montants envoyés à l'API restent des nombres bruts.
 */
export function useFormat() {
    const { lang, t } = useI18n();
    const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';

    const money = useCallback(
        (amount: number | null | undefined) =>
            // Espace insécable classique à la place de l'espace fine (U+202F), trop étroite dans la police des titres.
            `${new Intl.NumberFormat(locale).format(Number(amount ?? 0)).replace(/\u202f/g, '\u00a0')}\u00a0${t('common.currency')}`,
        [locale, t],
    );

    const date = useCallback(
        (value: string | null | undefined) =>
            value ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—',
        [locale],
    );

    const dateTime = useCallback(
        (value: string | null | undefined) =>
            value
                ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
                : '—',
        [locale],
    );

    return { money, date, dateTime };
}
