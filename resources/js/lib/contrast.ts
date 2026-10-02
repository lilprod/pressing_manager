/** Ratio de contraste WCAG (même formule que le script de génération de palette de
 * tailwind.config.js, portée en TS pour une validation live côté client — voir
 * CLAUDE.md « Conventions établies » pour la méthode de référence). */

function srgbChannel(c: number): number {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16) || 0;
    const g = parseInt(normalized.slice(2, 4), 16) || 0;
    const b = parseInt(normalized.slice(4, 6), 16) || 0;
    return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

/** Ratio de contraste entre deux couleurs hex (#RRGGBB), de 1 (aucun contraste) à 21. */
export function contrastRatio(hexA: string, hexB: string): number {
    const lA = relativeLuminance(hexA) + 0.05;
    const lB = relativeLuminance(hexB) + 0.05;
    return lA > lB ? lA / lB : lB / lA;
}

/** Seuil WCAG AA pour du texte courant (≥ 4,5:1). */
export function meetsAA(ratio: number): boolean {
    return ratio >= 4.5;
}
