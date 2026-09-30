import { Droplets, Palette, Scissors, Shirt, Tag, WashingMachine, type LucideIcon } from 'lucide-react';
import type { Tone } from '../components/ui/StatusBadge';

/** Icône et teinte associées à chaque catégorie de service, réutilisées partout où un service est affiché (comptoir, catalogue). */
export function categoryMeta(category: string): { icon: LucideIcon; tone: Tone } {
    switch (category) {
        case 'nettoyage':
            return { icon: WashingMachine, tone: 'brand' };
        case 'lavage':
            return { icon: Droplets, tone: 'sky' };
        case 'repassage':
            return { icon: Shirt, tone: 'accent' };
        case 'retouche':
            return { icon: Scissors, tone: 'violet' };
        case 'teinture':
            return { icon: Palette, tone: 'rose' };
        default:
            return { icon: Tag, tone: 'neutral' };
    }
}
