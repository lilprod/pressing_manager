import defaultTheme from 'tailwindcss/defaultTheme';

/**
 * Système de design « Pressing Manager » — aligné sur la maquette Figma SPARK PRESSING.
 *
 * - brand  : vert forêt (Dark Forest #24483F), calé sur brand-600 — navigation et
 *            bouton primaire. Blanc dessus : 10,1:1 (clair) ; encre dessus sur
 *            brand-400 : 4,8:1 (sombre).
 * - accent : or premium (Luxury Gold #C8A54B), calé sur accent-500 — CTA sélectifs
 *            et mise en avant (équivalent du safran précédent).
 * - ink    : reprend l'échelle neutre "slate" de la maquette (Neutral 50…900),
 *            complétée par les paliers manquants avec les valeurs slate standard.
 *            ink-350 = ink-400, conservé pour ne pas casser les classes existantes.
 *
 * Toutes les paires texte/fond utilisées dans les boutons/liens ont été vérifiées
 * (WCAG 2.1 AA, ≥ 4,5:1 texte courant / ≥ 3:1 composants).
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
                    50: '#f8f9f9',
                    100: '#dbe2e1',
                    200: '#afc5bf',
                    300: '#82aca2',
                    400: '#558f81',
                    500: '#3a6b5f',
                    600: '#24483f',
                    700: '#1d3b34',
                    800: '#17302a',
                    900: '#132722',
                    950: '#0f1f1b',
                },
                accent: {
                    50: '#faf9f8',
                    100: '#edeae2',
                    200: '#ddd5c0',
                    300: '#d3c39c',
                    400: '#cbb272',
                    500: '#c8a54b',
                    600: '#aa8833',
                    700: '#806726',
                    800: '#5b491a',
                    900: '#3d3112',
                    950: '#241d0a',
                },
                ink: {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    350: '#94a3b8',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617',
                },
            },
            fontFamily: {
                sans: ['Inter', ...defaultTheme.fontFamily.sans],
                display: ['Inter', ...defaultTheme.fontFamily.sans],
            },
            borderRadius: {
                '4xl': '2rem',
            },
            boxShadow: {
                card: '0 1px 2px 0 rgb(12 20 27 / 0.04), 0 1px 3px 0 rgb(12 20 27 / 0.06)',
                'card-hover': '0 4px 12px -2px rgb(12 20 27 / 0.08), 0 2px 4px -2px rgb(12 20 27 / 0.06)',
                pop: '0 12px 32px -8px rgb(12 20 27 / 0.18), 0 4px 8px -4px rgb(12 20 27 / 0.08)',
                brand: '0 8px 20px -6px rgb(36 72 63 / 0.45)',
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
