/** Plages de dates pour les écrans de pilotage (valeurs au format des champs <input type="date">). */

export type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'year';

export type DateRange = {
    from: string;
    to: string;
};

export function toDateInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parse(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function presetRange(preset: PeriodPreset, now = new Date()): DateRange {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(today);
    if (preset === '7d') start.setDate(start.getDate() - 6);
    if (preset === '30d') start.setDate(start.getDate() - 29);
    if (preset === 'month') start.setDate(1);
    if (preset === 'year') start.setMonth(0, 1);
    return { from: toDateInputValue(start), to: toDateInputValue(today) };
}

/** Période de même durée juste avant [from, to] — base de comparaison des variations. */
export function previousRange({ from, to }: DateRange): DateRange {
    const start = parse(from);
    const end = parse(to);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    return { from: toDateInputValue(prevStart), to: toDateInputValue(prevEnd) };
}

export function matchPreset(range: DateRange): PeriodPreset | null {
    for (const preset of ['today', '7d', '30d', 'month', 'year'] as PeriodPreset[]) {
        const r = presetRange(preset);
        if (r.from === range.from && r.to === range.to) return preset;
    }
    return null;
}
