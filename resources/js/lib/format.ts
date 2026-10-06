import { useCallback } from 'react';
import { useI18n } from '../contexts/I18nContext';

/** Durée écoulée façon "42 min" / "2h 06" / "1h" — utilisé par le tableau Atelier (Kanban). */
export function elapsedLabel(from: string, now: Date = new Date()): string {
    const totalMinutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${String(minutes).padStart(2, '0')}`;
}

/** Texte relatif court (« il y a 2 min »/« il y a 3 h »/« il y a 5 j ») — superadmin (Pressings/Vue plateforme/fiche détail). */
export function timeAgo(value: string | null | undefined): string {
    if (!value) return '—';
    const totalMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (totalMinutes < 1) return "à l'instant";
    if (totalMinutes < 60) return `il y a ${totalMinutes} min`;
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return `il y a ${totalHours} h`;
    const totalDays = Math.floor(totalHours / 24);
    return `il y a ${totalDays} j`;
}

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

    const time = useCallback(
        (value: string | null | undefined) =>
            value ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—',
        [locale],
    );

    /** Jour + mois sans année (ex. « 28 sept. ») — légende d'histogramme. */
    const dayMonth = useCallback(
        (value: string | null | undefined) =>
            value ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(value)) : '—',
        [locale],
    );

    return { money, date, dateTime, time, dayMonth };
}
