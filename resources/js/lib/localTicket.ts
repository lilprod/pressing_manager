/**
 * Numéro temporaire d'un dépôt pris hors ligne (« LOCAL-LOME01-0042 ») : compteur propre
 * à l'appareil, jamais un numéro de dépôt officiel — celui-ci est attribué par le
 * serveur à la synchronisation.
 */
const KEY = 'pm.localTicketCounter';

function read(): number {
    try {
        return Number(localStorage.getItem(KEY) ?? '0') || 0;
    } catch {
        return 0;
    }
}

function format(agencyCode: string | null, n: number): string {
    return `LOCAL-${(agencyCode ?? 'AG').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${String(n).padStart(4, '0')}`;
}

/** Prochain numéro qui sera réservé (aperçu, ne consomme rien). */
export function peekLocalReference(agencyCode: string | null): string {
    return format(agencyCode, read() + 1);
}

/** Réserve et renvoie le numéro au moment où le dépôt est mis en file. */
export function reserveLocalReference(agencyCode: string | null): string {
    const next = read() + 1;
    try {
        localStorage.setItem(KEY, String(next));
    } catch {
        // Sans stockage, le numéro reste affiché mais ne sera pas incrémenté.
    }
    return format(agencyCode, next);
}
