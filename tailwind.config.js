import defaultTheme from 'tailwindcss/defaultTheme';

/**
 * Système de design « Pressing Manager ».
 *
 * - brand  : bleu lagon (eau claire, linge propre, confiance). brand-600 est la
 *            teinte des actions principales en mode clair (blanc dessus : 4,98:1),
 *            brand-400/300 la teinte des actions en mode sombre (encre dessus : ≥ 7,5:1).
 * - accent : safran chaleureux, réservé aux accents (express, mises en avant).
 * - ink    : neutres gris-bleu légèrement teintés, utilisés à la place de slate.
 *            ink-400 est calibré pour atteindre 3:1 (bordures de champs) sur blanc
 *            et ink-350 (texte secondaire en mode sombre) reste ≥ 5,2:1 même sur ink-800.
 *
 * Tous les couples texte/fond ont été vérifiés (WCAG 2.1 AA) : voir le rapport de
 * refonte pour la liste des ratios calculés.
 */

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        './resources/**/*.blade.php',
        './resources/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eefbfc',
                    100: '#d4f3f6',
                    200: '#aee6ed',
                    300: '#74d1de',
                    400: '#36b4c7',
                    500: '#1497ad',
                    600: '#0f7a91',
                    700: '#106276',
                    800: '#144f60',
                    900: '#154251',
                    950: '#082a36',
                },
                accent: {
                    50: '#fff8ed',
                    100: '#ffeed4',
                    200: '#fed9a8',
                    300: '#fdbc71',
                    400: '#fb9538',
                    500: '#f97612',
                    600: '#ea5b08',
                    700: '#c24309',
                    800: '#9a3510',
                    900: '#7c2e10',
                    950: '#431407',
                },
                ink: {
                    50: '#f5f8fa',
                    100: '#ebf0f3',
                    200: '#d8e1e7',
                    300: '#b9c7d0',
                    350: '#98a9b4',
                    400: '#7b8e9a',
                    500: '#62788a',
                    600: '#4a5e6d',
                    700: '#3a4b58',
                    800: '#253441',
                    900: '#17222c',
                    950: '#0c141b',
                },
            },
            fontFamily: {
                sans: ['Figtree', ...defaultTheme.fontFamily.sans],
                display: ['"Plus Jakarta Sans"', 'Figtree', ...defaultTheme.fontFamily.sans],
            },
            borderRadius: {
                '4xl': '2rem',
            },
            boxShadow: {
                card: '0 1px 2px 0 rgb(12 20 27 / 0.04), 0 1px 3px 0 rgb(12 20 27 / 0.06)',
                'card-hover': '0 4px 12px -2px rgb(12 20 27 / 0.08), 0 2px 4px -2px rgb(12 20 27 / 0.06)',
                pop: '0 12px 32px -8px rgb(12 20 27 / 0.18), 0 4px 8px -4px rgb(12 20 27 / 0.08)',
                brand: '0 8px 20px -6px rgb(15 122 145 / 0.45)',
                'inner-top': 'inset 0 1px 0 0 rgb(255 255 255 / 0.04)',
            },
            keyframes: {
                'fade-in': {
                    from: { opacity: '0', transform: 'translateY(4px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                'pop-in': {
                    '0%': { transform: 'scale(0.6)', opacity: '0' },
                    '60%': { transform: 'scale(1.1)', opacity: '1' },
                    '100%': { transform: 'scale(1)' },
                },
                scanline: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(calc(var(--scan-h, 200px) - 2px))' },
                },
            },
            animation: {
                'fade-in': 'fade-in 180ms ease-out both',
                'pop-in': 'pop-in 220ms ease-out both',
                scanline: 'scanline 2.4s ease-in-out infinite',
            },
        },
    },
    plugins: [],
};
